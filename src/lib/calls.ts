import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database, id, one } from "./db";
import { body, fail, limit } from "./security";
const json = (d: unknown) => NextResponse.json(d);
export function callConfiguration(uid: string) {
  const urls = (process.env.TURN_URLS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const configured =
    urls.length > 0 &&
    urls.every((x) =>
      /^turns?:[a-z0-9.\-\[\]:]+(?:\?transport=(?:udp|tcp))?$/i.test(x),
    ) &&
    !!process.env.TURN_SHARED_SECRET;
  if (configured) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${uid}`,
      credential = createHmac("sha1", process.env.TURN_SHARED_SECRET!)
        .update(username)
        .digest("base64");
    return {
      available: true,
      mode: "relay" as const,
      iceServers: [{ urls, username, credential }],
      iceTransportPolicy: "relay" as RTCIceTransportPolicy,
    };
  }
  return {
    available: process.env.NODE_ENV === "development",
    mode: "direct-development" as const,
    iceServers: [],
    iceTransportPolicy: "all" as RTCIceTransportPolicy,
  };
}
export async function callRoute(
  req: NextRequest,
  parts: string[],
  u: Record<string, any>,
) {
  const db = await database(),
    rid = z.string().uuid().parse(parts[0]),
    method = req.method;
  const membership = await one(
    "SELECT r.kind,m.role FROM conversations r JOIN conversation_members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2",
    [rid, u.id],
  );
  if (!membership) fail(404, "Conversation unavailable");
  const config = callConfiguration(u.id);
  if (parts[2] === "config" && method === "GET") {
    await limit(`call-config:${u.id}`, 30, 3600);
    return json(config);
  }
  if (parts.length === 2 && method === "POST")
    await limit(`call-join:${u.id}`, 60, 3600);
  // Media is never stored here. SDP/candidates are short-lived and never logged.
  return db.transaction(async (tx) => {
    await tx.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [
      rid,
    ]);
    const member = await one(
      "SELECT r.kind,r.direct_pair,m.role FROM conversations r JOIN conversation_members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2",
      [rid, u.id],
      tx,
    );
    if (!member) fail(404, "Conversation unavailable");
    if (member!.kind === "direct") {
      const peer = member!.direct_pair
        .split(":")
        .find((x: string) => x !== u.id);
      if (
        await one(
          "SELECT 1 FROM conversation_blocks WHERE (user_id=$1 AND blocked_id=$2) OR(user_id=$2 AND blocked_id=$1)",
          [u.id, peer],
          tx,
        )
      )
        fail(403, "Call unavailable");
    }
    await tx.query(
      "DELETE FROM call_signals WHERE created_at<now()-interval '90 seconds'",
    );
    await tx.query(
      "UPDATE communication_calls SET ended_at=now() WHERE room_id=$1 AND ended_at IS NULL AND (started_at<now()-interval '1 hour' OR NOT EXISTS(SELECT 1 FROM call_participants p WHERE p.call_id=communication_calls.id AND p.left_at IS NULL AND p.last_seen>now()-interval '60 seconds'))",
      [rid],
    );
    let call = await one(
      "SELECT * FROM communication_calls WHERE room_id=$1 AND ended_at IS NULL",
      [rid],
      tx,
    );
    const publisher =
      member!.kind !== "channel" || ["owner", "admin"].includes(member!.role);
    if (parts.length === 2 && method === "POST") {
      const d = z
        .object({ allowDirect: z.boolean().default(false) })
        .parse(await body(req));
      if (!config.available) fail(503, "Calls require a configured TURN relay");
      if (config.mode === "direct-development" && !d.allowDirect)
        fail(409, "Explicit consent is required for direct development calls");
      if (!call) {
        if (!publisher)
          fail(403, "Only channel administrators can start a broadcast");
        const cid = id();
        await tx.query(
          "INSERT INTO communication_calls(id,room_id,started_by) VALUES($1,$2,$3)",
          [cid, rid, u.id],
        );
        call = { id: cid };
      }
      const active = await one(
        "SELECT count(*) AS n FROM call_participants p JOIN conversation_members m ON m.user_id=p.user_id AND m.room_id=$2 WHERE p.call_id=$1 AND p.user_id<>$3 AND p.left_at IS NULL AND p.last_seen>now()-interval '45 seconds'",
        [call.id, rid, u.id],
        tx,
      );
      if (Number(active?.n) >= 4)
        fail(409, "This beta call is limited to four participants");
      await tx.query(
        "INSERT INTO call_participants(call_id,user_id) VALUES($1,$2) ON CONFLICT(call_id,user_id) DO UPDATE SET left_at=NULL,last_seen=now(),joined_at=now()",
        [call.id, u.id],
      );
      return json({ id: call.id, publisher });
    }
    if (!call) return json({ call: null, participants: [], signals: [] });
    const consent = await one(
      "SELECT 1 FROM call_participants WHERE call_id=$1 AND user_id=$2 AND left_at IS NULL AND last_seen>now()-interval '45 seconds'",
      [call.id, u.id],
      tx,
    );
    if (parts[2] === "leave" && method === "POST") {
      await tx.query(
        "UPDATE call_participants SET left_at=now() WHERE call_id=$1 AND user_id=$2",
        [call.id, u.id],
      );
      await tx.query(
        "DELETE FROM call_signals WHERE call_id=$1 AND (sender_id=$2 OR recipient_id=$2)",
        [call.id, u.id],
      );
      if (member!.kind === "channel" && call.started_by === u.id)
        await tx.query(
          "UPDATE communication_calls SET ended_at=now() WHERE id=$1",
          [call.id],
        );
      return json({ ok: true });
    }
    if (parts[2] === "signal" && method === "POST") {
      if (!consent) fail(403, "Join the call before signaling");
      const d = z
        .object({
          target: z.string().uuid(),
          clientId: z.string().uuid(),
          payload: z.discriminatedUnion("type", [
            z.object({ type: z.literal("offer"), sdp: z.string().max(100000) }),
            z.object({
              type: z.literal("answer"),
              sdp: z.string().max(100000),
            }),
            z.object({
              type: z.literal("candidate"),
              candidate: z.object({
                candidate: z.string().max(4000),
                sdpMid: z.string().max(100).nullable().optional(),
                sdpMLineIndex: z
                  .number()
                  .int()
                  .min(0)
                  .max(20)
                  .nullable()
                  .optional(),
                usernameFragment: z.string().max(200).nullable().optional(),
              }),
            }),
          ]),
        })
        .parse(await body(req));
      if (
        d.target === u.id ||
        !(await one(
          "SELECT 1 FROM call_participants p JOIN conversation_members m ON m.user_id=p.user_id AND m.room_id=$3 JOIN users u ON u.id=p.user_id WHERE p.call_id=$1 AND p.user_id=$2 AND p.left_at IS NULL AND p.last_seen>now()-interval '45 seconds' AND u.deleted_at IS NULL AND NOT u.suspended",
          [call.id, d.target, rid],
          tx,
        ))
      )
        fail(404, "Call participant unavailable");
      // Channel subscribers may answer a publisher, but cannot negotiate viewer-to-viewer media.
      if (
        member!.kind === "channel" &&
        !publisher &&
        !(await one(
          "SELECT 1 FROM conversation_members WHERE room_id=$1 AND user_id=$2 AND role IN('owner','admin')",
          [rid, d.target],
          tx,
        ))
      )
        fail(403, "Subscriber-to-subscriber calls are unavailable");
      const rate = await one(
        "SELECT count(*) AS n FROM call_signals WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",
        [u.id],
        tx,
      );
      if (Number(rate?.n) > 300) fail(429, "Call signaling limit reached");
      await tx.query(
        "INSERT INTO call_signals(call_id,sender_id,recipient_id,client_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [call.id, u.id, d.target, d.clientId, JSON.stringify(d.payload)],
      );
      return json({ ok: true });
    }
    if (parts.length === 2 && method === "GET") {
      if (consent)
        await tx.query(
          "UPDATE call_participants SET last_seen=now() WHERE call_id=$1 AND user_id=$2",
          [call.id, u.id],
        );
      const participants = (
        await tx.query(
          "SELECT p.user_id,u.alias,p.joined_at,(r.kind<>'channel' OR m.role IN('owner','admin')) AS publisher FROM call_participants p JOIN users u ON u.id=p.user_id JOIN conversation_members m ON m.user_id=p.user_id AND m.room_id=$2 JOIN conversations r ON r.id=m.room_id WHERE p.call_id=$1 AND p.left_at IS NULL AND p.last_seen>now()-interval '45 seconds' AND u.deleted_at IS NULL AND NOT u.suspended ORDER BY p.user_id",
          [call.id, rid],
        )
      ).rows;
      const after = req.nextUrl.searchParams.get("after") || "0";
      if (!/^\d{1,18}$/.test(after)) fail(400, "Invalid signal cursor");
      const signals = consent
        ? (
            await tx.query(
              "SELECT seq::text,sender_id,payload FROM call_signals WHERE call_id=$1 AND recipient_id=$2 AND seq>$3::bigint ORDER BY seq LIMIT 100",
              [call.id, u.id, after],
            )
          ).rows
        : [];
      return json({
        call: {
          id: call.id,
          started_by: call.started_by,
          started_at: call.started_at,
        },
        participants,
        signals,
      });
    }
    fail(404, "Call action unavailable");
  });
}
