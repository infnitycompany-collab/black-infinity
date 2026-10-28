import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { NextRequest } from "next/server";
import { database, one } from "./db";
import { fail } from "./security";
import { parseRange, GB } from "./policy";
import { reserveDelivery } from "./media";
export function publicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolveApproved(raw: string, allowed: string[]) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed.includes(url.origin)
  )
    fail(403, "Source origin is not approved");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    fail(403, "Source network is not public");
  return { url, address: addresses[0] };
}
export async function relay(
  req: NextRequest,
  m: Record<string, any>,
  userId: string,
) {
  if (!m.provider_url || m.mode !== "managed")
    fail(404, "No approved relay source");
  const allowed = (process.env.RELAY_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.length) fail(503, "Media relay is not configured");
  let range;
  try {
    range = parseRange(req.headers.get("range"), Number(m.size));
  } catch {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${m.size}` },
    });
  }
  const amount = range.end - range.start + 1,
    db = await database();
  const reservation = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(125238)");
    const active = await one(
      "SELECT count(*) AS n FROM delivery WHERE relay AND active AND created_at>now()-interval '5 minutes'",
      [],
      tx,
    );
    if (Number(active?.n) >= 4) fail(429, "Relay is busy. Try again shortly.");
    const mine = await one(
      "SELECT count(*) AS n FROM delivery WHERE relay AND active AND user_id=$1 AND created_at>now()-interval '5 minutes'",
      [userId],
      tx,
    );
    if (Number(mine?.n) >= 2) fail(429, "Too many simultaneous streams");
    const used = await one(
      "SELECT coalesce(sum(bytes),0) AS n FROM delivery WHERE relay AND created_at>=date_trunc('month',now())",
      [],
      tx,
    );
    const cap = Math.min(
      50 * GB,
      Number(process.env.RELAY_BUDGET_BYTES || 50 * GB),
    );
    if (!Number.isFinite(cap) || Number(used?.n) + amount > cap)
      fail(429, "Relay infrastructure budget reached");
    const rid = await reserveDelivery(tx, userId, amount, true);
    await tx.query("UPDATE delivery SET active=true WHERE id=$1", [rid]);
    return rid;
  });
  let current = m.provider_url,
    dispatcher: Agent | undefined,
    result: Awaited<ReturnType<typeof request>> | undefined;
  let sent = 0,
    settled = false;
  async function settle() {
    if (settled) return;
    settled = true;
    await db.query("UPDATE delivery SET bytes=$2,active=false WHERE id=$1", [
      reservation,
      sent,
    ]);
    await dispatcher?.close();
  }
  try {
    for (let i = 0; i <= 3; i++) {
      const { url, address } = await resolveApproved(current, allowed);
      // Pin the vetted DNS answer for this connection. TLS still validates the original hostname.
      dispatcher = new Agent({
        connect: {
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
        },
      });
      result = await request(url, {
        dispatcher,
        method: "GET",
        headers: {
          range: `bytes=${range.start}-${range.end}`,
          "accept-encoding": "identity",
        },
        headersTimeout: 10000,
        bodyTimeout: 15000,
        signal: AbortSignal.timeout(120000),
      });
      if ([301, 302, 303, 307, 308].includes(result.statusCode)) {
        const location = result.headers.location;
        result.body.destroy();
        await dispatcher.close();
        dispatcher = undefined;
        if (!location || i === 3) fail(502, "Provider redirect failed");
        current = new URL(String(location), url).href;
        continue;
      }
      break;
    }
    if (!result) throw new Error("Provider response missing");
    const response = result;
    if (![200, 206].includes(response.statusCode))
      fail(502, "Provider could not serve media");
    if (
      response.statusCode === 200 &&
      (range.start !== 0 || range.end !== Number(m.size) - 1)
    )
      fail(502, "Provider does not support seeking");
    if (
      response.statusCode === 206 &&
      response.headers["content-range"] !==
        `bytes ${range.start}-${range.end}/${m.size}`
    )
      fail(502, "Provider range mismatch");
    if (
      response.headers["content-length"] &&
      Number(response.headers["content-length"]) !== amount
    )
      fail(502, "Provider size changed");
    const reader = response.body[Symbol.asyncIterator]();
    const stream = new ReadableStream<Uint8Array>({
      async pull(c) {
        try {
          const r = await reader.next();
          if (r.done) {
            if (sent !== amount) throw new Error("Truncated provider response");
            await settle();
            c.close();
            return;
          }
          if (sent + r.value.byteLength > amount)
            throw new Error("Provider response exceeded allowance");
          sent += r.value.byteLength;
          c.enqueue(r.value);
        } catch {
          response.body.destroy();
          await settle();
          c.error(new Error("Relay interrupted"));
        }
      },
      async cancel() {
        response.body.destroy();
        await settle();
      },
    });
    const headers: Record<string, string> = {
      "Content-Type": m.mime,
      "Content-Length": String(amount),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (range.partial)
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${m.size}`;
    return new Response(stream, { status: range.partial ? 206 : 200, headers });
  } catch (e) {
    result?.body.destroy();
    await settle();
    throw e;
  }
}
