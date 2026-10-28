import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { database, one, id, type DB } from "./db";
import { fail, body, limit } from "./security";
import { CHUNK, GB, PLANS, parseRange } from "./policy";
import { putChunk, getChunk } from "./storage";
export async function access(mediaId: string, userId: string) {
  const m = await one(
    `SELECT m.*,s.wrapped_key AS share_wrapped FROM media m JOIN users owner ON owner.id=m.user_id LEFT JOIN shares s ON s.media_id=m.id AND s.recipient_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() WHERE m.id=$1 AND m.deleted_at IS NULL AND owner.deleted_at IS NULL AND NOT owner.suspended AND (m.user_id=$2 OR s.id IS NOT NULL)`,
    [mediaId, userId],
  );
  if (!m) fail(404, "Media not found");
  return m!;
}
export async function reserveDelivery(
  tx: DB,
  userId: string,
  bytes: number,
  relay = false,
) {
  await tx.query("SELECT pg_advisory_xact_lock(125237)");
  const u = await one("SELECT plan FROM users WHERE id=$1", [userId], tx);
  const plan = PLANS[u?.plan as keyof typeof PLANS] || PLANS.free;
  const used = await one(
    "SELECT coalesce(sum(bytes),0) AS n FROM delivery WHERE user_id=$1 AND created_at>=date_trunc('month',now())",
    [userId],
    tx,
  );
  if (Number(used?.n) + bytes > plan.delivery * GB)
    fail(429, "Monthly delivery allowance reached");
  if (relay) {
    const total = await one(
      "SELECT coalesce(sum(bytes),0) AS n FROM delivery WHERE relay AND created_at>=date_trunc('month',now())",
      [],
      tx,
    );
    if (Number(total?.n) + bytes > 50 * GB)
      fail(429, "Beta relay allowance reached");
  }
  const reservation = id();
  await tx.query(
    "INSERT INTO delivery(id,user_id,bytes,relay) VALUES($1,$2,$3,$4)",
    [reservation, userId, bytes, relay],
  );
  return reservation;
}
export async function mediaRoute(
  req: NextRequest,
  parts: string[],
  u: Record<string, any>,
): Promise<Response | undefined> {
  const db = await database();
  const [root, mid, action, index] = parts;
  if (root !== "media") return;
  if (!mid && req.method === "GET") {
    const rows = (
      await db.query(
        `SELECT m.*,s.wrapped_key AS share_wrapped FROM media m LEFT JOIN shares s ON s.media_id=m.id AND s.recipient_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now() WHERE m.user_id=$1 OR (s.id IS NOT NULL AND m.deleted_at IS NULL AND m.status='ready') ORDER BY m.created_at DESC LIMIT 1000`,
        [u.id],
      )
    ).rows;
    return NextResponse.json({
      media: rows.map(({ provider_url, ...m }) => m),
    });
  }
  if (!mid && req.method === "POST") {
    await limit(`upload:${u.id}`, 20, 3600);
    const p = z
      .object({
        id: z.uuid(),
        mode: z.enum(["managed", "vault"]),
        name: z.string().max(255),
        mime: z.string().max(100),
        size: z.number().int().min(1).max(GB),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        folderId: z.uuid().nullable().optional(),
      })
      .parse(await body(req));
    if (p.mode === "vault" && (!p.metadata || !u.vault_public_key))
      fail(400, "Set up your vault first");
    if (p.mode === "managed" && !/^(video|audio)\/[a-z0-9.+-]+$/i.test(p.mime))
      fail(400, "Choose an audio or video file");
    const stored =
      p.size + (p.mode === "vault" ? Math.ceil(p.size / CHUNK) * 16 : 0);
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
      if (
        p.folderId &&
        !(await one(
          "SELECT id FROM folders WHERE id=$1 AND user_id=$2",
          [p.folderId, u.id],
          tx,
        ))
      )
        fail(404, "Folder not found");
      const usage = await one(
        "SELECT coalesce(sum(size+CASE WHEN mode='vault' THEN ceil(size::numeric/4194304)*16 ELSE 0 END),0) AS n FROM media WHERE user_id=$1",
        [u.id],
        tx,
      );
      const reward = await one(
        "SELECT coalesce(sum(gb),0) AS n FROM reward_ledger r WHERE user_id=$1 AND state='granted' AND expires_at>now() AND NOT EXISTS(SELECT 1 FROM reward_ledger x WHERE x.reverses_id=r.id AND x.state='reversed')",
        [u.id],
        tx,
      );
      const plan = PLANS[u.plan as keyof typeof PLANS] || PLANS.free;
      if (
        Number(usage?.n) + stored >
        (plan.gb + Math.min(5, Number(reward?.n))) * GB
      )
        fail(409, "Storage allowance reached");
      await tx.query(
        "INSERT INTO media(id,user_id,mode,name,mime,size,metadata,folder_id,chunk_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          p.id,
          u.id,
          p.mode,
          p.mode === "vault" ? "Encrypted media" : p.name,
          p.mode === "vault" ? "application/octet-stream" : p.mime,
          p.size,
          p.metadata ? JSON.stringify(p.metadata) : null,
          p.folderId || null,
          Math.ceil(p.size / CHUNK),
        ],
      );
    });
    return NextResponse.json({ id: p.id, chunkSize: CHUNK }, { status: 201 });
  }
  if (!mid || !z.uuid().safeParse(mid).success) fail(404, "Media not found");
  if (action === "chunks" && req.method === "PUT") {
    const m = await one(
      "SELECT * FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
      [mid, u.id],
    );
    if (
      !m ||
      m.status !== "uploading" ||
      new Date(m.upload_expires_at) < new Date()
    )
      fail(409, "Upload is unavailable");
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= m!.chunk_count)
      fail(400, "Invalid chunk index");
    const expected =
      Math.min(CHUNK, Number(m!.size) - idx * CHUNK) +
      (m!.mode === "vault" ? 16 : 0);
    if (Number(req.headers.get("content-length")) !== expected)
      fail(400, "Chunk length mismatch");
    // Read at most one bounded chunk even when a client lies about Content-Length.
    const reader = req.body?.getReader();
    if (!reader) fail(400, "Missing chunk");
    let length = 0;
    const data = new Uint8Array(expected);
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      if (length + value.byteLength > expected) {
        await reader!.cancel();
        fail(413, "Chunk too large");
      }
      data.set(value, length);
      length += value.byteLength;
    }
    if (length !== expected) fail(400, "Truncated chunk");
    const digest = createHash("sha256").update(data).digest("hex");
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM media WHERE id=$1 FOR UPDATE", [mid]);
      const old = await one(
        "SELECT digest FROM chunks WHERE media_id=$1 AND idx=$2",
        [mid, idx],
        tx,
      );
      if (old) {
        if (old.digest !== digest)
          fail(409, "Chunk differs from previously uploaded data");
        return;
      }
      await putChunk(mid, idx, data);
      await tx.query(
        "INSERT INTO chunks(media_id,idx,size,digest) VALUES($1,$2,$3,$4)",
        [mid, idx, length, digest],
      );
    });
    return NextResponse.json({ ok: true, index: idx });
  }
  if (action === "complete" && req.method === "POST") {
    await db.transaction(async (tx) => {
      const m = await one(
        "SELECT * FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE",
        [mid, u.id],
        tx,
      );
      if (!m) fail(404, "Upload not found");
      if (m!.status === "ready") return;
      const chunks = await one(
        "SELECT count(*) AS n,coalesce(sum(size),0) AS size FROM chunks WHERE media_id=$1",
        [mid],
        tx,
      );
      if (Number(chunks?.n) !== m!.chunk_count)
        fail(409, "Upload has missing chunks");
      await tx.query(
        "UPDATE media SET status='ready',stored_size=$2,completed_at=now() WHERE id=$1",
        [mid, chunks!.size],
      );
      await tx.query(
        "INSERT INTO notifications(id,user_id,kind,message) VALUES($1,$2,'upload','Your upload is ready.')",
        [id(), u.id],
      );
    });
    return NextResponse.json({ ok: true });
  }
  if (action === "status" && req.method === "GET") {
    const m = await one(
      "SELECT status,metadata FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
      [mid, u.id],
    );
    if (!m) fail(404, "Upload not found");
    return NextResponse.json({
      status: m!.status,
      metadata: m!.metadata,
      chunks: (
        await db.query(
          "SELECT idx FROM chunks WHERE media_id=$1 ORDER BY idx",
          [mid],
        )
      ).rows.map((x) => x.idx),
    });
  }
  if (action === "process" && req.method === "POST") {
    const p = z
      .object({ height: z.union([z.literal(480), z.literal(720)]) })
      .parse(await body(req));
    const m = await one(
      "SELECT id FROM media WHERE id=$1 AND user_id=$2 AND mode='managed' AND status='ready' AND deleted_at IS NULL",
      [mid, u.id],
    );
    if (!m) fail(404, "Managed media not found");
    await limit(`process:${u.id}`, 5, 3600);
    const outputId = id();
    await db.query(
      "INSERT INTO jobs(id,kind,payload) VALUES($1,'transcode',$2)",
      [
        id(),
        JSON.stringify({
          mediaId: mid,
          userId: u.id,
          outputId,
          height: p.height,
        }),
      ],
    );
    return NextResponse.json({ ok: true, outputId, status: "queued" });
  }
  if (req.method === "PATCH" && !action) {
    const p = z
      .object({
        favorite: z.boolean().optional(),
        trash: z.boolean().optional(),
        name: z.string().trim().min(1).max(255).optional(),
        folderId: z.uuid().nullable().optional(),
        position: z.number().min(0).max(1e8).optional(),
      })
      .parse(await body(req));
    const m = await one("SELECT * FROM media WHERE id=$1 AND user_id=$2", [
      mid,
      u.id,
    ]);
    if (!m) fail(404, "Media not found");
    if (m!.moderated && p.trash === false)
      fail(403, "Moderator review is required before restoring this media");
    if (p.name && m!.mode === "vault")
      fail(400, "Vault names must remain encrypted");
    if (
      p.folderId &&
      !(await one("SELECT id FROM folders WHERE id=$1 AND user_id=$2", [
        p.folderId,
        u.id,
      ]))
    )
      fail(404, "Folder not found");
    await db.query(
      "UPDATE media SET favorite=coalesce($3,favorite),deleted_at=CASE WHEN $4::boolean IS NULL THEN deleted_at WHEN $4 THEN now() ELSE NULL END,name=coalesce($5,name),folder_id=CASE WHEN $6 THEN $7 ELSE folder_id END,position=coalesce($8,position) WHERE id=$1 AND user_id=$2",
      [
        mid,
        u.id,
        p.favorite ?? null,
        p.trash ?? null,
        p.name ?? null,
        "folderId" in p,
        p.folderId ?? null,
        p.position ?? null,
      ],
    );
    if (p.trash) {
      await db.query("UPDATE shares SET revoked_at=now() WHERE media_id=$1", [
        mid,
      ]);
      await db.query(
        "UPDATE external_links SET revoked_at=now() WHERE media_id=$1",
        [mid],
      );
    }
    return NextResponse.json({ ok: true });
  }
  const m = await access(mid, u.id);
  if (m.status !== "ready") fail(409, "Upload not complete");
  if (action === "chunks" && req.method === "GET") {
    const idx = Number(index);
    if (
      m.mode !== "vault" ||
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= m.chunk_count
    )
      fail(404, "Chunk not found");
    const size = Math.min(CHUNK, Number(m.size) - idx * CHUNK) + 16;
    await db.transaction((tx) => reserveDelivery(tx, u.id, size));
    const chunk = await getChunk(mid, idx);
    return new Response(chunk as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Length": String(chunk.length),
      },
    });
  }
  if (action === "stream" && req.method === "GET") {
    if (m.mode !== "managed")
      fail(400, "Vault media must be decrypted on your device");
    return managedStream(req, m, u.id);
  }
  if (action === "external" && req.method === "POST") {
    if (m.mode !== "managed" || m.user_id !== u.id)
      fail(403, "External playback requires owned managed media");
    const { token, hash } = await import("./security");
    const raw = token();
    await db.query(
      "INSERT INTO external_links(hash,media_id,user_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [hash(raw), mid, u.id],
    );
    return NextResponse.json({
      url: `${process.env.APP_ORIGIN || "http://localhost:3000"}/api/v1/external/${raw}`,
      expiresIn: 600,
    });
  }
  fail(404, "Unknown media operation");
}
export async function managedStream(
  req: NextRequest,
  m: Record<string, any>,
  userId: string,
) {
  if (m.provider_url) {
    const { relay } = await import("./relay");
    return relay(req, m, userId);
  }
  let range;
  try {
    range = parseRange(req.headers.get("range"), Number(m.size));
  } catch {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${m.size}` },
    });
  }
  const db = await database(),
    reservation = await db.transaction((tx) =>
      reserveDelivery(tx, userId, range.end - range.start + 1),
    );
  let at = range.start,
    sent = 0,
    settled = false;
  async function settle() {
    if (settled) return;
    settled = true;
    await db.query("UPDATE delivery SET bytes=$2 WHERE id=$1", [
      reservation,
      sent,
    ]);
  }
  const stream = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        if (at > range.end) {
          await settle();
          c.close();
          return;
        }
        const idx = Math.floor(at / CHUNK),
          offset = at - idx * CHUNK,
          take = Math.min(CHUNK - offset, range.end - at + 1);
        const chunk = await getChunk(m.id, idx, offset, offset + take - 1);
        if (chunk.length !== take) throw new Error("Truncated object");
        c.enqueue(chunk);
        at += take;
        sent += take;
      } catch (e) {
        await settle();
        c.error(e);
      }
    },
    async cancel() {
      await settle();
    },
  });
  const headers: Record<string, string> = {
    "Content-Type": m.mime,
    "Content-Length": String(range.end - range.start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (range.partial)
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${m.size}`;
  return new Response(stream, { status: range.partial ? 206 : 200, headers });
}
