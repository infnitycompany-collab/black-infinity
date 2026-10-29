import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database, id, one, type DB } from "./db";
import { body, fail, hash, limit, token } from "./security";
import { callRoute } from "./calls";

const json = (data: unknown) => NextResponse.json(data);
const uuid = z.string().uuid();
async function member(tx: DB, room: string, uid: string) {
  const r = await one(
    `SELECT r.*,m.role,m.muted,m.archived FROM conversations r JOIN conversation_members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2 FOR UPDATE OF r`,
    [room, uid],
    tx,
  );
  if (!r) fail(404, "Conversation unavailable");
  return r!;
}
const manage = (r: Record<string, any>) => {
  if (!["owner", "admin"].includes(r.role))
    fail(403, "Conversation administrator required");
};
export async function conversationRoute(
  req: NextRequest,
  parts: string[],
  u: Record<string, any>,
) {
  const db = await database(),
    method = req.method,
    uid = u.id as string;
  if (parts[1] === 'call') return callRoute(req, parts, u);
  if (!parts.length && method === "GET")
    return json({
      rooms: (
        await db.query(
          `SELECT r.id,r.kind,r.title,r.description,r.created_at,m.role,m.muted,m.archived,(SELECT count(*)::int FROM conversation_messages x WHERE x.room_id=r.id AND x.seq>m.read_seq AND x.sender_id<>$1 AND x.deleted_at IS NULL) AS unread,(SELECT count(*)::int FROM conversation_members c WHERE c.room_id=r.id) AS members FROM conversations r JOIN conversation_members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY r.updated_at DESC LIMIT 100`,
          [uid],
        )
      ).rows,
    });
  if (!parts.length && method === "POST") {
    await limit(`conversation-create:${uid}`, 10, 3600);
    const d = z
      .object({
        kind: z.enum(["direct", "group", "channel"]),
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500).default(""),
        recipient: uuid.optional(),
      })
      .parse(await body(req));
    return json(
      await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(125241)");
        if (
          Number(
            (
              await one(
                "SELECT count(*) AS n FROM conversation_members WHERE user_id=$1",
                [uid],
                tx,
              )
            )?.n,
          ) >= 50
        )
          fail(409, "Conversation limit reached");
        let pair: string | null = null;
        if (d.kind === "direct") {
          if (!d.recipient || d.recipient === uid)
            fail(400, "Choose another account ID");
          if (
            !(await one(
              "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended",
              [d.recipient],
              tx,
            ))
          )
            fail(404, "Account unavailable");
          if (
            await one(
              "SELECT 1 FROM conversation_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)",
              [uid, d.recipient],
              tx,
            )
          )
            fail(403, "Conversation unavailable");
          pair = [uid, d.recipient!].sort().join(":");
          const existing = await one(
            "SELECT id FROM conversations WHERE direct_pair=$1",
            [pair],
            tx,
          );
          if (existing) {
            await tx.query(
              `INSERT INTO conversation_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT(room_id,user_id) DO UPDATE SET archived=false`,
              [existing.id, uid],
            );
            return { id: existing.id };
          }
        }
        const rid = id();
        await tx.query(
          "INSERT INTO conversations(id,kind,title,description,direct_pair) VALUES($1,$2,$3,$4,$5)",
          [rid, d.kind, d.title, d.description, pair],
        );
        await tx.query(
          "INSERT INTO conversation_members(room_id,user_id,role) VALUES($1,$2,$3)",
          [rid, uid, d.kind === "direct" ? "member" : "owner"],
        );
        if (d.kind === "direct")
          await tx.query(
            "INSERT INTO conversation_members(room_id,user_id,role) VALUES($1,$2,'member')",
            [rid, d.recipient],
          );
        return { id: rid };
      }),
    );
  }
  if (parts[0] === "join" && method === "POST") {
    await limit(`conversation-join:${uid}`, 20, 3600);
    const d = z
      .object({ code: z.string().min(20).max(100) })
      .parse(await body(req));
    return json(
      await db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(125241)");
        const invite = await one(
          "SELECT * FROM conversation_invites WHERE hash=$1 AND expires_at>now() AND consumed_by IS NULL AND NOT revoked FOR UPDATE",
          [hash(d.code)],
          tx,
        );
        if (!invite) fail(404, "Invitation expired or unavailable");
        const room = await one(
          "SELECT id FROM conversations WHERE id=$1 FOR UPDATE",
          [invite!.room_id],
          tx,
        );
        if (!room) fail(404, "Conversation unavailable");
        if (
          !(await one(
            "SELECT 1 FROM conversation_members WHERE room_id=$1 AND user_id=$2 AND role IN('owner','admin')",
            [room!.id, invite!.created_by],
            tx,
          ))
        )
          fail(404, "Invitation unavailable");
        if (
          await one(
            "SELECT 1 FROM conversation_blocks WHERE (user_id=$1 AND blocked_id=$2) OR(user_id=$2 AND blocked_id=$1)",
            [uid, invite!.created_by],
            tx,
          )
        )
          fail(403, "Conversation unavailable");
        if (
          Number(
            (
              await one(
                "SELECT count(*) AS n FROM conversation_members WHERE user_id=$1",
                [uid],
                tx,
              )
            )?.n,
          ) >= 50
        )
          fail(409, "Conversation limit reached");
        if (
          Number(
            (
              await one(
                "SELECT count(*) AS n FROM conversation_members WHERE room_id=$1",
                [room!.id],
                tx,
              )
            )?.n,
          ) >= 25
        )
          fail(409, "Beta member limit reached");
        await tx.query(
          "INSERT INTO conversation_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
          [room!.id, uid],
        );
        await tx.query(
          "UPDATE conversation_invites SET consumed_by=$2 WHERE hash=$1",
          [hash(d.code), uid],
        );
        return { id: room!.id };
      }),
    );
  }
  if (parts[0] === "blocks") {
    if (method === "GET")
      return json({
        blocks: (
          await db.query(
            "SELECT blocked_id FROM conversation_blocks WHERE user_id=$1",
            [uid],
          )
        ).rows,
      });
    const d = z.object({ account: uuid }).parse(await body(req));
    if (d.account === uid) fail(400, "Choose another account ID");
    if (method === "POST") {
      await db.query(
        "INSERT INTO conversation_blocks(user_id,blocked_id) SELECT $1,id FROM users WHERE id=$2 ON CONFLICT DO NOTHING",
        [uid, d.account],
      );
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await db.query(
        "DELETE FROM conversation_blocks WHERE user_id=$1 AND blocked_id=$2",
        [uid, d.account],
      );
      return json({ ok: true });
    }
  }
  const rid = uuid.parse(parts[0]);
  // Every operation, including reads, rechecks membership while locking the room.
  return db.transaction(async (tx) => {
    const room = await member(tx, rid, uid);
    if (parts.length === 1 && method === "GET") {
      const before = req.nextUrl.searchParams.get("before");
      if (before && !/^\d{1,18}$/.test(before)) fail(400, "Invalid cursor");
      const messages = (
        await tx.query(
          `SELECT x.id,x.seq::text,x.sender_id,u.alias,x.body,x.reply_to,x.created_at,x.edited_at,x.deleted_at,x.pinned,(SELECT coalesce(json_agg(json_build_object('emoji',e.emoji,'user_id',e.user_id)),'[]') FROM conversation_reactions e WHERE e.message_id=x.id) AS reactions FROM conversation_messages x JOIN users u ON u.id=x.sender_id WHERE x.room_id=$1 AND ($2::bigint IS NULL OR x.seq<$2) ORDER BY x.seq DESC LIMIT 50`,
          [rid, before || null],
        )
      ).rows.reverse();
      const members = (
        await tx.query(
          "SELECT m.user_id,u.alias,m.role FROM conversation_members m JOIN users u ON u.id=m.user_id WHERE room_id=$1 ORDER BY m.role,u.alias",
          [rid],
        )
      ).rows;
      return json({
        room: {
          id: rid,
          kind: room.kind,
          title: room.title,
          description: room.description,
          role: room.role,
          muted: room.muted,
          archived: room.archived,
        },
        members,
        messages,
      });
    }
    if (parts.length === 1 && method === "PATCH") {
      manage(room);
      const d = z
        .object({
          title: z.string().trim().min(1).max(80),
          description: z.string().trim().max(500),
        })
        .parse(await body(req));
      await tx.query(
        "UPDATE conversations SET title=$2,description=$3,updated_at=now() WHERE id=$1",
        [rid, d.title, d.description],
      );
      return json({ ok: true });
    }
    if (parts.length === 1 && method === "DELETE") {
      if (room.role !== "owner") fail(403, "Conversation owner required");
      await tx.query("DELETE FROM conversations WHERE id=$1", [rid]);
      return json({ ok: true });
    }
    if (parts[1] === "preferences" && method === "PATCH") {
      const d = z
        .object({ muted: z.boolean(), archived: z.boolean() })
        .parse(await body(req));
      await tx.query(
        "UPDATE conversation_members SET muted=$3,archived=$4 WHERE room_id=$1 AND user_id=$2",
        [rid, uid, d.muted, d.archived],
      );
      return json({ ok: true });
    }
    if (parts[1] === "read" && method === "POST") {
      // Only acknowledge messages actually returned to this client, never unseen concurrent arrivals.
      const d = z
        .object({ seq: z.string().regex(/^\d{1,18}$/) })
        .parse(await body(req));
      await tx.query(
        "UPDATE conversation_members SET read_seq=greatest(read_seq,coalesce((SELECT max(seq) FROM conversation_messages WHERE room_id=$1 AND seq<=$3::bigint),0)) WHERE room_id=$1 AND user_id=$2",
        [rid, uid, d.seq],
      );
      return json({ ok: true });
    }
    if (parts[1] === "leave" && method === "POST") {
      if (room.role === "owner")
        fail(409, "Transfer ownership or delete the conversation first");
      await tx.query(
        "DELETE FROM conversation_members WHERE room_id=$1 AND user_id=$2",
        [rid, uid],
      );
      return json({ ok: true });
    }
    if (parts[1] === "members" && method === "PATCH") {
      if (room.role !== "owner") fail(403, "Conversation owner required");
      const d = z
        .object({
          userId: uuid,
          role: z.enum(["member", "admin", "owner", "remove"]),
        })
        .parse(await body(req));
      if (d.userId === uid) fail(400, "Choose another member");
      if (
        !(await one(
          "SELECT 1 FROM conversation_members WHERE room_id=$1 AND user_id=$2",
          [rid, d.userId],
          tx,
        ))
      )
        fail(404, "Member unavailable");
      if (d.role === "remove")
        await tx.query(
          "DELETE FROM conversation_members WHERE room_id=$1 AND user_id=$2",
          [rid, d.userId],
        );
      else {
        if (d.role === "owner")
          await tx.query(
            "UPDATE conversation_members SET role='admin' WHERE room_id=$1 AND user_id=$2",
            [rid, uid],
          );
        await tx.query(
          "UPDATE conversation_members SET role=$3 WHERE room_id=$1 AND user_id=$2",
          [rid, d.userId, d.role],
        );
      }
      return json({ ok: true });
    }
    if (parts[1] === "invites") {
      manage(room);
      if (room.kind === "direct")
        fail(400, "Direct conversations do not accept invitations");
      if (method === "POST") {
        const code = token();
        await tx.query(
          "INSERT INTO conversation_invites(hash,room_id,created_by,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
          [hash(code), rid, uid],
        );
        return json({ code });
      }
      if (method === "DELETE") {
        await tx.query(
          "UPDATE conversation_invites SET revoked=true WHERE room_id=$1",
          [rid],
        );
        return json({ ok: true });
      }
    }
    if (parts[1] === "messages" && parts.length === 2 && method === "POST") {
      await tx.query("SELECT pg_advisory_xact_lock(125242)");
      if (room.kind === "channel") manage(room);
      const d = z
        .object({
          body: z.string().trim().min(1).max(4000),
          clientId: uuid,
          replyTo: uuid.nullable().default(null),
        })
        .parse(await body(req));
      const prior = await one(
        "SELECT id FROM conversation_messages WHERE room_id=$1 AND sender_id=$2 AND client_id=$3",
        [rid, uid, d.clientId],
        tx,
      );
      if (prior) return json({ id: prior.id });
      if (room.kind === "direct") {
        const peer = room.direct_pair.split(":").find((x: string) => x !== uid);
        if (
          !(await one(
            "SELECT 1 FROM users u JOIN conversation_members m ON m.user_id=u.id WHERE m.room_id=$1 AND u.id=$2 AND u.deleted_at IS NULL AND NOT u.suspended",
            [rid, peer],
            tx,
          ))
        )
          fail(403, "Recipient unavailable");
        if (
          await one(
            "SELECT 1 FROM conversation_blocks WHERE (user_id=$1 AND blocked_id=$2) OR(user_id=$2 AND blocked_id=$1)",
            [uid, peer],
            tx,
          )
        )
          fail(403, "Conversation unavailable");
      }
      if (
        d.replyTo &&
        !(await one(
          "SELECT id FROM conversation_messages WHERE room_id=$1 AND id=$2 AND deleted_at IS NULL",
          [rid, d.replyTo],
          tx,
        ))
      )
        fail(404, "Reply unavailable");
      const count = await one(
        "SELECT count(*) AS n FROM conversation_messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",
        [uid],
        tx,
      );
      if (Number(count?.n) >= 30)
        fail(429, "Message limit reached. Try again shortly.");
      const mid = id();
      await tx.query(
        "INSERT INTO conversation_messages(id,room_id,sender_id,body,client_id,reply_to) VALUES($1,$2,$3,$4,$5,$6)",
        [mid, rid, uid, d.body, d.clientId, d.replyTo],
      );
      await tx.query("UPDATE conversations SET updated_at=now() WHERE id=$1", [
        rid,
      ]);
      await tx.query(
        "INSERT INTO notifications(id,user_id,kind,message) SELECT gen_random_uuid()::text,user_id,'conversation','New conversation message' FROM conversation_members WHERE room_id=$1 AND user_id<>$2 AND NOT muted AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=conversation_members.user_id AND n.kind='conversation' AND n.read_at IS NULL AND n.created_at>now()-interval '1 minute')",
        [rid, uid],
      );
      return json({ id: mid });
    }
    if (parts[1] === "messages" && parts[2]) {
      const mid = uuid.parse(parts[2]),
        message = await one(
          "SELECT * FROM conversation_messages WHERE room_id=$1 AND id=$2 FOR UPDATE",
          [rid, mid],
          tx,
        );
      if (!message) fail(404, "Message unavailable");
      if (parts[3] === "report" && method === "POST") {
        const d = z
          .object({ reason: z.string().trim().min(3).max(500) })
          .parse(await body(req));
        await tx.query(
          "INSERT INTO appeals(id,user_id,message) VALUES($1,$2,$3)",
          [id(), uid, `Conversation report ${rid}/${mid}: ${d.reason}`],
        );
        return json({ ok: true });
      }
      if (parts[3] === "reaction" && method === "POST") {
        if (message!.deleted_at) fail(409, "Message removed");
        const d = z
          .object({ emoji: z.enum(["👍", "❤️", "🎉", "👀"]) })
          .parse(await body(req));
        const old = await one(
          "DELETE FROM conversation_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3 RETURNING user_id",
          [mid, uid, d.emoji],
          tx,
        );
        if (!old)
          await tx.query(
            "INSERT INTO conversation_reactions(message_id,user_id,emoji) VALUES($1,$2,$3)",
            [mid, uid, d.emoji],
          );
        return json({ ok: true });
      }
      if (parts[3] === "pin" && method === "POST") {
        manage(room);
        if (message!.deleted_at) fail(409, "Message removed");
        await tx.query(
          "UPDATE conversation_messages SET pinned=NOT pinned WHERE id=$1",
          [mid],
        );
        return json({ ok: true });
      }
      if (parts.length === 3 && method === "PATCH") {
        if (message!.sender_id !== uid) fail(403, "Only the sender can edit");
        if (message!.deleted_at) fail(409, "Message removed");
        if (room.kind === "channel") manage(room);
        const d = z
          .object({ body: z.string().trim().min(1).max(4000) })
          .parse(await body(req));
        await tx.query(
          "UPDATE conversation_messages SET body=$2,edited_at=now() WHERE id=$1",
          [mid, d.body],
        );
        return json({ ok: true });
      }
      if (parts.length === 3 && method === "DELETE") {
        if (message!.sender_id !== uid) manage(room);
        await tx.query(
          "UPDATE conversation_messages SET body='',deleted_at=now(),pinned=false WHERE id=$1",
          [mid],
        );
        await tx.query(
          "DELETE FROM conversation_reactions WHERE message_id=$1",
          [mid],
        );
        return json({ ok: true });
      }
    }
    fail(404, "Action unavailable");
  });
}
