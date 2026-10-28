import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database, one, id } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  user,
  sameOrigin,
  fail,
  body,
  HttpError,
  requireAdmin,
  requireRecent,
  audit,
  token,
  hash,
  limit,
} from "@/lib/security";
import { mediaRoute, managedStream } from "@/lib/media";
import { rewardSummary } from "@/lib/rewards";
import { PLANS, GB } from "@/lib/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (x: unknown, status = 200) => NextResponse.json(x, { status });
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const parts = (await params).path || [],
      path = parts.join("/"),
      method = req.method;
    if (!["GET", "HEAD"].includes(method)) sameOrigin(req);
    if (path === "health")
      return json({
        status: "ok",
        version: "0.1.0",
        database: "not_checked",
        cashCommissions: false,
        payments: false,
      });
    if (parts[0] === "auth" && method === "POST")
      return await auth(req, parts.slice(1).join("/"));
    if (parts[0] === "posts" && method === "GET") {
      const db = await database();
      if (parts[1])
        return json({
          post:
            (await one(
              "SELECT slug,locale,title,body,cover_data,cover_alt,created_at FROM posts WHERE slug=$1 AND locale=$2 AND published",
              [parts[1], req.nextUrl.searchParams.get("locale") || "en"],
            )) || null,
        });
      return json({
        posts: (
          await db.query(
            "SELECT slug,locale,title,body,cover_data,cover_alt,created_at FROM posts WHERE published ORDER BY created_at DESC LIMIT 20",
          )
        ).rows,
      });
    }
    if (parts[0] === "external" && method === "GET") {
      const link = await one(
        `SELECT m.*,l.user_id AS charged_user FROM external_links l JOIN media m ON m.id=l.media_id JOIN users u ON u.id=l.user_id WHERE l.hash=$1 AND l.expires_at>now() AND l.revoked_at IS NULL AND m.deleted_at IS NULL AND m.status='ready' AND m.mode='managed' AND u.deleted_at IS NULL AND NOT u.suspended`,
        [hash(parts[1] || "")],
      );
      if (!link) fail(404, "Playback link expired");
      return await managedStream(req, link!, link!.charged_user);
    }
    const u = await user(req);
    const db = await database();
    await limit(`account:${u.id}`, 900, 60);
    if (path === "notifications/events" && method === "GET") {
      let timer: ReturnType<typeof setInterval> | undefined,
        closed = false,
        last = "";
      const stream = new ReadableStream({
        start(controller) {
          const stop = () => {
            closed = true;
            if (timer) clearInterval(timer);
            try {
              controller.close();
            } catch {}
          };
          req.signal.addEventListener("abort", stop, { once: true });
          const poll = async () => {
            try {
              await user(req);
              const state = await one(
                "SELECT count(*) AS total,count(read_at) AS read,max(created_at) AS latest FROM notifications WHERE user_id=$1",
                [u.id],
              );
              const signature = JSON.stringify(state);
              if (!closed) {
                controller.enqueue(
                  new TextEncoder().encode(
                    signature !== last
                      ? "event: inbox\ndata: {}\n\n"
                      : ": keepalive\n\n",
                  ),
                );
                last = signature;
              }
            } catch {
              stop();
            }
          };
          void poll();
          timer = setInterval(poll, 15000);
        },
        cancel() {
          closed = true;
          if (timer) clearInterval(timer);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "private, no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (path === "connections/telegram" && method === "POST") {
      const { telegramConfigured, telegramCall } =
        await import("@/lib/telegram");
      if (!telegramConfigured())
        fail(503, "Telegram bot credentials are not configured");
      const p = z.object({ consent: z.literal(true) }).parse(await body(req));
      void p;
      const bot = await telegramCall("getMe", {}),
        raw = token();
      if (!/^[a-zA-Z0-9_]+$/.test(bot.username || ""))
        fail(502, "Invalid bot identity");
      await db.query(
        "INSERT INTO telegram_links(user_id,code_hash,code_expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,code_expires_at=excluded.code_expires_at",
        [u.id, hash(raw)],
      );
      return json({
        url: `https://t.me/${bot.username}?start=${raw}`,
        notice:
          "Imports are managed media, not E2EE. Telegram receives your connection and Telegram account identity.",
      });
    }
    if (path === "connections/telegram" && method === "DELETE") {
      await db.query("DELETE FROM telegram_links WHERE user_id=$1", [u.id]);
      return json({ ok: true });
    }
    const media = await mediaRoute(req, parts, u);
    if (media) return media;
    if (path === "me" && method === "GET") {
      const usage = await one(
        "SELECT coalesce(sum(size),0) AS bytes,count(*) AS files FROM media WHERE user_id=$1",
        [u.id],
      );
      const bonus = await one(
        "SELECT coalesce(sum(gb),0) AS gb FROM reward_ledger r WHERE user_id=$1 AND state='granted' AND expires_at>now() AND NOT EXISTS(SELECT 1 FROM reward_ledger x WHERE x.reverses_id=r.id AND x.state='reversed')",
        [u.id],
      );
      return json({
        user: {
          id: u.id,
          alias: u.alias,
          role: u.role,
          plan: u.plan,
          referralCode: u.referral_code,
          createdAt: u.created_at,
          vaultPublicKey: u.vault_public_key,
          vaultWrapped: u.vault_wrapped,
        },
        usage: {
          bytes: Number(usage?.bytes),
          files: Number(usage?.files),
          limit:
            ((PLANS[u.plan as keyof typeof PLANS] || PLANS.free).gb +
              Math.min(5, Number(bonus?.gb))) *
            GB,
        },
        features: {
          payments: false,
          cashCommissions: false,
          telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
          terabox: false,
          push: Boolean(process.env.VAPID_PUBLIC_KEY),
        },
        pushKey: process.env.VAPID_PUBLIC_KEY || null,
      });
    }
    if (path === "vault" && method === "POST") {
      const p = z
        .object({
          publicKey: z.object({
            kty: z.literal("RSA"),
            n: z.string().min(100).max(2000),
            e: z.literal("AQAB"),
            alg: z.string().optional(),
            ext: z.boolean().optional(),
            key_ops: z.array(z.string()).optional(),
          }),
          wrapped: z.object({
            version: z.literal(1),
            iv: z.string().max(30),
            cipher: z.string().min(100).max(15000),
          }),
        })
        .parse(await body(req));
      const changed = await db.query(
        "UPDATE users SET vault_public_key=$2,vault_wrapped=$3 WHERE id=$1 AND vault_public_key IS NULL RETURNING id",
        [u.id, JSON.stringify(p.publicKey), JSON.stringify(p.wrapped)],
      );
      if (!changed.rows.length)
        fail(409, "Vault already exists. Use its recovery kit.");
      await audit(u.id, "vault.initialize");
      return json({ ok: true });
    }
    if (path === "folders") {
      if (method === "GET")
        return json({
          folders: (
            await db.query(
              "SELECT * FROM folders WHERE user_id=$1 ORDER BY created_at DESC",
              [u.id],
            )
          ).rows,
        });
      if (method === "POST") {
        const p = z
          .object({ name: z.string().trim().min(1).max(80) })
          .parse(await body(req));
        await db.query(
          "INSERT INTO folders(id,user_id,name) VALUES($1,$2,$3)",
          [id(), u.id, p.name],
        );
        return json({ ok: true });
      }
    }
    if (path === "playlists") {
      if (method === "GET")
        return json({
          playlists: (
            await db.query("SELECT * FROM playlists WHERE user_id=$1", [u.id])
          ).rows,
        });
      if (method === "POST") {
        const p = z
          .object({
            name: z.string().trim().min(1).max(80),
            mediaIds: z.array(z.uuid()).max(100),
          })
          .parse(await body(req));
        for (const mid of p.mediaIds)
          if (
            !(await one(
              "SELECT id FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND mode='managed'",
              [mid, u.id],
            ))
          )
            fail(400, "Playlists currently support owned managed media");
        await db.query(
          "INSERT INTO playlists(id,user_id,name,media_ids) VALUES($1,$2,$3,$4)",
          [id(), u.id, p.name, JSON.stringify(p.mediaIds)],
        );
        return json({ ok: true });
      }
    }
    if (path === "recipient" && method === "GET") {
      const recipient = await one(
        "SELECT id,vault_public_key FROM users WHERE referral_code=$1 AND deleted_at IS NULL AND NOT suspended",
        [req.nextUrl.searchParams.get("code") || ""],
      );
      if (!recipient) fail(404, "Recipient not found");
      return json({ recipient });
    }
    if (path === "shares") {
      if (method === "GET")
        return json({
          shares: (
            await db.query(
              "SELECT s.id,s.media_id,s.recipient_id,s.expires_at,s.revoked_at,m.mode,m.name FROM shares s JOIN media m ON m.id=s.media_id WHERE s.owner_id=$1 ORDER BY s.created_at DESC",
              [u.id],
            )
          ).rows,
        });
      if (method === "POST") {
        const p = z
          .object({
            mediaId: z.uuid(),
            recipientId: z.uuid(),
            days: z.number().int().min(1).max(30),
            wrappedKey: z.string().max(2000).nullable().optional(),
          })
          .parse(await body(req));
        const m = await one(
          "SELECT id,mode FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND status='ready'",
          [p.mediaId, u.id],
        );
        if (!m) fail(404, "Media not found");
        if (p.recipientId === u.id) fail(400, "Choose another recipient");
        if (
          !(await one(
            "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended",
            [p.recipientId],
          ))
        )
          fail(404, "Recipient not found");
        if (m!.mode === "vault" && !p.wrappedKey)
          fail(400, "Encrypted recipient key required");
        await db.transaction(async (tx) => {
          const sid = id();
          await tx.query(
            "INSERT INTO shares(id,media_id,owner_id,recipient_id,wrapped_key,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 day')",
            [
              sid,
              p.mediaId,
              u.id,
              p.recipientId,
              p.wrappedKey ? JSON.stringify({ key: p.wrappedKey }) : null,
              p.days,
            ],
          );
          await tx.query(
            "INSERT INTO notifications(id,user_id,kind,message) VALUES($1,$2,'share','Someone shared media with you.')",
            [id(), p.recipientId],
          );
          await tx.query(
            "INSERT INTO jobs(id,kind,payload) VALUES($1,'push',$2)",
            [id(), JSON.stringify({ userId: p.recipientId })],
          );
        });
        return json({ ok: true });
      }
    }
    if (parts[0] === "shares" && parts[1] && method === "DELETE") {
      await db.query(
        "UPDATE shares SET revoked_at=now() WHERE id=$1 AND owner_id=$2",
        [parts[1], u.id],
      );
      return json({ ok: true });
    }
    if (path === "notifications") {
      if (method === "GET")
        return json({
          notifications: (
            await db.query(
              "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
              [u.id],
            )
          ).rows,
        });
      if (method === "PATCH") {
        await db.query(
          "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
          [u.id],
        );
        return json({ ok: true });
      }
    }
    if (path === "push" && method === "POST") {
      if (!process.env.VAPID_PUBLIC_KEY)
        fail(503, "Web Push is not configured");
      const p = z
        .object({
          endpoint: z.url().max(2048),
          keys: z.object({
            p256dh: z.string().max(200),
            auth: z.string().max(100),
          }),
        })
        .parse(await body(req));
      const url = new URL(p.endpoint);
      if (
        url.protocol !== "https:" ||
        ![
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "web.push.apple.com",
        ].some((h) => url.hostname === h || url.hostname.endsWith("." + h))
      )
        fail(400, "Push service not supported");
      await db.query(
        "INSERT INTO push_subscriptions(endpoint_hash,user_id,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription",
        [hash(p.endpoint), u.id, JSON.stringify(p)],
      );
      return json({ ok: true });
    }
    if (path === "rewards" && method === "GET")
      return json(await rewardSummary(u.id));
    if (path === "appeals" && method === "POST") {
      const p = z
        .object({ message: z.string().trim().min(10).max(2000) })
        .parse(await body(req));
      await limit(`appeal:${u.id}`, 3, 86400);
      await db.query(
        "INSERT INTO appeals(id,user_id,message) VALUES($1,$2,$3)",
        [id(), u.id, p.message],
      );
      return json({ ok: true });
    }
    if (path === "partners") {
      if (method === "GET")
        return json({
          partner:
            (await one("SELECT * FROM partners WHERE user_id=$1", [u.id])) ||
            null,
          campaigns: (
            await db.query(
              "SELECT c.id,c.name,c.tag,count(v.id) AS visits FROM campaigns c LEFT JOIN campaign_visits v ON v.campaign_id=c.id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC",
              [u.id],
            )
          ).rows,
          cashEnabled: false,
        });
      if (method === "POST") {
        const p = z
          .object({ website: z.url().max(300), note: z.string().max(1000) })
          .parse(await body(req));
        if (new URL(p.website).protocol !== "https:")
          fail(400, "Use an HTTPS website");
        await db.query(
          "INSERT INTO partners(user_id,website,note) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING",
          [u.id, p.website, p.note],
        );
        return json({ ok: true });
      }
    }
    if (path === "campaigns" && method === "POST") {
      const partner = await one(
        "SELECT user_id FROM partners WHERE user_id=$1 AND status='approved'",
        [u.id],
      );
      if (!partner) fail(403, "Approved partner access required");
      const p = z
        .object({ name: z.string().trim().min(1).max(80) })
        .parse(await body(req));
      await db.query(
        "INSERT INTO campaigns(id,user_id,name,tag) VALUES($1,$2,$3,$4)",
        [id(), u.id, p.name, token().slice(0, 16)],
      );
      return json({ ok: true });
    }
    if (path === "privacy" && method === "GET")
      return json({
        sessions: (
          await db.query(
            "SELECT hash,created_at,expires_at,verified_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC",
            [u.id],
          )
        ).rows.map((s) => ({
          id: s.hash,
          current: s.hash === u.session_hash,
          createdAt: s.created_at,
          expiresAt: s.expires_at,
        })),
        passkeys: (
          await db.query(
            "SELECT id,created_at FROM credentials WHERE user_id=$1",
            [u.id],
          )
        ).rows,
        subscriptions:
          (
            await one(
              "SELECT count(*) AS n FROM push_subscriptions WHERE user_id=$1",
              [u.id],
            )
          )?.n || 0,
      });
    if (path === "privacy/recovery-codes" && method === "POST") {
      requireRecent(u);
      const codes = Array.from({ length: 8 }, () => token());
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        await tx.query("DELETE FROM recovery_codes WHERE user_id=$1", [u.id]);
        for (const code of codes)
          await tx.query(
            "INSERT INTO recovery_codes(hash,user_id) VALUES($1,$2)",
            [hash(code), u.id],
          );
        await audit(u.id, "recovery.regenerate", u.id, tx);
      });
      return json({ codes });
    }
    if (
      parts[0] === "privacy" &&
      parts[1] === "passkey" &&
      parts[2] &&
      method === "DELETE"
    ) {
      requireRecent(u);
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
        const count = await one(
          "SELECT count(*) AS n FROM credentials WHERE user_id=$1",
          [u.id],
          tx,
        );
        if (Number(count?.n) <= 1)
          fail(409, "Add another passkey before removing this one");
        await tx.query("DELETE FROM credentials WHERE id=$1 AND user_id=$2", [
          parts[2],
          u.id,
        ]);
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
        await audit(u.id, "passkey.remove", u.id, tx);
      });
      const r = json({ ok: true });
      r.cookies.delete("bi_session");
      return r;
    }
    if (path === "privacy/revoke" && method === "POST") {
      const p = z.object({ id: z.string().length(64) }).parse(await body(req));
      await db.query("DELETE FROM sessions WHERE hash=$1 AND user_id=$2", [
        p.id,
        u.id,
      ]);
      return json({ ok: true });
    }
    if (path === "privacy/push" && method === "DELETE") {
      await db.query("DELETE FROM push_subscriptions WHERE user_id=$1", [u.id]);
      return json({ ok: true });
    }
    if (path === "privacy/export" && method === "GET") {
      const tables = [
        "media",
        "folders",
        "playlists",
        "notifications",
        "reward_ledger",
        "shares",
        "partners",
        "campaigns",
        "appeals",
      ];
      const result: Record<string, unknown> = {
        account: { id: u.id, alias: u.alias, createdAt: u.created_at },
        note: "Vault contents and encrypted metadata require your recovery kit. This export is delivered only to your signed-in browser.",
      };
      for (const table of tables) {
        const col = table === "shares" ? "owner_id" : "user_id";
        result[table] = (
          await db.query(`SELECT * FROM ${table} WHERE ${col}=$1`, [u.id])
        ).rows.map(({ provider_url, ...r }) => r);
      }
      return new Response(JSON.stringify(result, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="black-infinity-export.json"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "privacy/delete" && method === "POST") {
      const p = z
        .object({ confirmation: z.literal("DELETE MY ACCOUNT") })
        .parse(await body(req));
      void p;
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE users SET deleted_at=now(),vault_public_key=NULL,vault_wrapped=NULL WHERE id=$1",
          [u.id],
        );
        await tx.query(
          "INSERT INTO deletion_tombstones(user_id) VALUES($1) ON CONFLICT DO NOTHING",
          [u.id],
        );
        await tx.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
        await tx.query("DELETE FROM recovery_codes WHERE user_id=$1", [u.id]);
        await tx.query("DELETE FROM push_subscriptions WHERE user_id=$1", [
          u.id,
        ]);
        await tx.query(
          "UPDATE shares SET revoked_at=now() WHERE owner_id=$1 OR recipient_id=$1",
          [u.id],
        );
        await tx.query(
          "UPDATE external_links SET revoked_at=now() WHERE user_id=$1",
          [u.id],
        );
        await tx.query(
          "INSERT INTO jobs(id,kind,payload) VALUES($1,'delete-account',$2)",
          [id(), JSON.stringify({ userId: u.id })],
        );
      });
      const r = json({ ok: true });
      r.cookies.delete("bi_session");
      return r;
    }
    if (parts[0] === "admin") {
      requireAdmin(u);
      if (
        ["owner", "moderator"].includes(u.role) &&
        parts[1] === "managed" &&
        parts[2] &&
        method === "GET"
      ) {
        const m = await one(
          "SELECT * FROM media WHERE id=$1 AND mode='managed' AND status='ready' AND deleted_at IS NULL",
          [parts[2]],
        );
        if (!m) fail(404, "Managed media not found");
        await audit(u.id, "moderation.play", m!.id);
        return await managedStream(req, m!, u.id);
      }
      if (
        ["owner", "moderator"].includes(u.role) &&
        path === "admin/moderate" &&
        method === "POST"
      ) {
        const p = z
          .object({ id: z.uuid(), restore: z.boolean().optional() })
          .parse(await body(req));
        if (p.restore && u.role !== "owner")
          fail(403, "Only the owner can restore moderated content");
        await db.transaction(async (tx) => {
          const m = await one(
            "UPDATE media SET deleted_at=CASE WHEN $2 THEN NULL ELSE now() END,moderated=NOT $2 WHERE id=$1 AND mode='managed' RETURNING id",
            [p.id, p.restore || false],
            tx,
          );
          if (!m) fail(404, "Managed media not found");
          await tx.query(
            "UPDATE shares SET revoked_at=now() WHERE media_id=$1",
            [p.id],
          );
          await tx.query(
            "UPDATE external_links SET revoked_at=now() WHERE media_id=$1",
            [p.id],
          );
          await audit(
            u.id,
            p.restore ? "moderation.restore" : "moderation.remove",
            p.id,
            tx,
          );
        });
        return json({ ok: true });
      }
      if (u.role !== "owner") {
        if (path === "admin" && method === "GET")
          return json({
            role: u.role,
            appeals: (
              await db.query(
                "SELECT id,user_id,message,status,created_at FROM appeals ORDER BY created_at DESC LIMIT 100",
              )
            ).rows,
            managedMedia:
              u.role === "moderator"
                ? (
                    await db.query(
                      "SELECT id,name,mime,created_at FROM media WHERE mode='managed' AND status='ready' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100",
                    )
                  ).rows
                : [],
          });
        if (path === "admin/appeal" && method === "PATCH") {
          const p = z
            .object({ id: z.uuid(), status: z.enum(["resolved", "rejected"]) })
            .parse(await body(req));
          await db.query("UPDATE appeals SET status=$2 WHERE id=$1", [
            p.id,
            p.status,
          ]);
          await audit(u.id, `appeal.${p.status}`, p.id);
          return json({ ok: true });
        }
        if (
          u.role === "moderator" &&
          parts[1] === "managed" &&
          parts[2] &&
          method === "GET"
        ) {
          const m = await one(
            "SELECT * FROM media WHERE id=$1 AND mode='managed' AND status='ready' AND deleted_at IS NULL",
            [parts[2]],
          );
          if (!m) fail(404, "Managed media not found");
          await audit(u.id, "moderation.play", m!.id);
          return await managedStream(req, m!, u.id);
        }
        if (
          u.role === "moderator" &&
          path === "admin/moderate" &&
          method === "POST"
        ) {
          const p = z.object({ id: z.uuid() }).parse(await body(req));
          await db.transaction(async (tx) => {
            const m = await one(
              "UPDATE media SET deleted_at=now() WHERE id=$1 AND mode='managed' RETURNING id",
              [p.id],
              tx,
            );
            if (!m) fail(404, "Managed media not found");
            await tx.query(
              "UPDATE shares SET revoked_at=now() WHERE media_id=$1",
              [p.id],
            );
            await tx.query(
              "UPDATE external_links SET revoked_at=now() WHERE media_id=$1",
              [p.id],
            );
            await audit(u.id, "moderation.remove", p.id, tx);
          });
          return json({ ok: true });
        }
        fail(403, "This action requires owner access");
      }
      if (path === "admin/role" && method === "PATCH") {
        const p = z
          .object({
            id: z.uuid(),
            role: z.enum(["user", "support", "moderator"]),
          })
          .parse(await body(req));
        await db.transaction(async (tx) => {
          const changed = await tx.query(
            "UPDATE users SET role=$2 WHERE id=$1 AND role<>'owner' AND deleted_at IS NULL RETURNING id",
            [p.id, p.role],
          );
          if (!changed.rows.length)
            fail(403, "Owner roles cannot be changed here");
          await tx.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
          await audit(u.id, `role.${p.role}`, p.id, tx);
        });
        return json({ ok: true });
      }
      if (path === "admin/rewards/reverse" && method === "POST") {
        const p = z
          .object({
            qualificationUserId: z.uuid(),
            reason: z.string().trim().min(10).max(500),
          })
          .parse(await body(req));
        await db.transaction(async (tx) => {
          await tx.query("SELECT pg_advisory_xact_lock(125236)");
          const entries = (
            await tx.query(
              "SELECT * FROM reward_ledger WHERE event_key IN($1,$2,$3) AND state='granted' FOR UPDATE",
              [
                "onboarding:" + p.qualificationUserId,
                "referral:" + p.qualificationUserId + ":recipient",
                "referral:" + p.qualificationUserId + ":inviter",
              ],
            )
          ).rows;
          for (const e of entries)
            await tx.query(
              "INSERT INTO reward_ledger(id,user_id,event_key,kind,state,gb,cost_cents,reverses_id) VALUES($1,$2,$3,'fraud-reversal','reversed',0,0,$4) ON CONFLICT(event_key) DO NOTHING",
              [id(), e.user_id, "reverse:" + e.id, e.id],
            );
          await tx.query(
            "UPDATE referral_qualifications SET status='reversed',reason=$2 WHERE user_id=$1",
            [p.qualificationUserId, p.reason],
          );
          await audit(u.id, "reward.reverse", p.qualificationUserId, tx);
        });
        return json({ ok: true });
      }
      if (path === "admin/worker-tick" && method === "POST") {
        if (process.env.DATABASE_URL)
          fail(409, "Production uses the separate worker service");
        const { tick } = await import("../../../../../scripts/worker");
        await tick();
        return json({ ok: true });
      }
      if (path === "admin/job" && method === "PATCH") {
        const p = z.object({ id: z.uuid() }).parse(await body(req));
        await db.query(
          "UPDATE jobs SET status='pending',available_at=now(),attempts=0 WHERE id=$1 AND status='failed'",
          [p.id],
        );
        await audit(u.id, "job.retry", p.id);
        return json({ ok: true });
      }
      if (path === "admin/appeal" && method === "PATCH") {
        const p = z
          .object({ id: z.uuid(), status: z.enum(["resolved", "rejected"]) })
          .parse(await body(req));
        await db.query("UPDATE appeals SET status=$2 WHERE id=$1", [
          p.id,
          p.status,
        ]);
        await audit(u.id, `appeal.${p.status}`, p.id);
        return json({ ok: true });
      }
      if (path === "admin" && method === "GET")
        return json({
          role: "owner",
          users: (
            await db.query(
              "SELECT id,alias,role,plan,created_at,suspended,deleted_at FROM users ORDER BY created_at DESC",
            )
          ).rows,
          jobs: (
            await db.query(
              "SELECT id,kind,status,attempts,created_at,last_error FROM jobs ORDER BY created_at DESC LIMIT 100",
            )
          ).rows,
          partners: (
            await db.query("SELECT * FROM partners ORDER BY created_at DESC")
          ).rows,
          appeals: (
            await db.query(
              "SELECT * FROM appeals ORDER BY created_at DESC LIMIT 100",
            )
          ).rows,
          audit: (
            await db.query(
              "SELECT * FROM audit ORDER BY created_at DESC LIMIT 100",
            )
          ).rows,
          posts: (
            await db.query("SELECT * FROM posts ORDER BY created_at DESC")
          ).rows,
          rewardLiability: await one(
            "SELECT coalesce(sum(cost_cents),0) AS cents FROM reward_ledger WHERE state='granted' AND expires_at>now()",
          ),
          relayUsage: await one(
            "SELECT coalesce(sum(bytes),0) AS bytes FROM delivery WHERE relay AND created_at>=date_trunc('month',now())",
          ),
          gates: {
            payments: false,
            cash: false,
            cryptoReview: false,
            backupsVerified: false,
          },
        });
      if (path === "admin/invites" && method === "POST") {
        const raw = token();
        await db.query(
          "INSERT INTO invites(hash,expires_at) VALUES($1,now()+interval '7 days')",
          [hash(raw)],
        );
        await audit(u.id, "invite.create");
        return json({ invite: raw });
      }
      if (path === "admin/user" && method === "PATCH") {
        const p = z
          .object({ id: z.uuid(), suspended: z.boolean() })
          .parse(await body(req));
        if (p.id === u.id) fail(400, "Cannot suspend your own account");
        await db.transaction(async (tx) => {
          await tx.query(
            "UPDATE users SET suspended=$2 WHERE id=$1 AND deleted_at IS NULL",
            [p.id, p.suspended],
          );
          if (p.suspended)
            await tx.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
          await audit(u.id, "user.suspension", p.id, tx);
        });
        return json({ ok: true });
      }
      if (path === "admin/partner" && method === "PATCH") {
        const p = z
          .object({ id: z.uuid(), status: z.enum(["approved", "rejected"]) })
          .parse(await body(req));
        await db.query("UPDATE partners SET status=$2 WHERE user_id=$1", [
          p.id,
          p.status,
        ]);
        await audit(u.id, `partner.${p.status}`, p.id);
        return json({ ok: true });
      }
      if (path === "admin/post" && method === "POST") {
        const p = z
          .object({
            slug: z
              .string()
              .regex(/^[a-z0-9-]+$/)
              .max(100),
            locale: z.enum(["en", "ar"]),
            title: z.string().min(3).max(160),
            body: z.string().min(10).max(50000),
            published: z.boolean(),
            cover: z.string().max(95000).optional(),
            coverAlt: z.string().max(160).optional(),
          })
          .parse(await body(req));
        let cover: string | null = null;
        if (p.cover) {
          if (!p.cover.startsWith("data:image/jpeg;base64,"))
            fail(400, "Cover must be a JPEG image");
          const sharp = (await import("sharp")).default;
          const data = await sharp(
            Buffer.from(p.cover.split(",")[1], "base64"),
            { limitInputPixels: 16000000 },
          )
            .rotate()
            .resize({
              width: 1200,
              height: 700,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 65 })
            .toBuffer();
          if (data.length > 70000) fail(400, "Choose a smaller cover image");
          cover = "data:image/jpeg;base64," + data.toString("base64");
        }
        await db.query(
          "INSERT INTO posts(id,slug,locale,title,body,published,author_id,cover_data,cover_alt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(slug,locale) DO UPDATE SET title=excluded.title,body=excluded.body,published=excluded.published,cover_data=coalesce(excluded.cover_data,posts.cover_data),cover_alt=coalesce(excluded.cover_alt,posts.cover_alt)",
          [
            id(),
            p.slug,
            p.locale,
            p.title,
            p.body,
            p.published,
            u.id,
            cover,
            p.coverAlt || p.title,
          ],
        );
        await audit(u.id, "blog.save", p.slug);
        return json({ ok: true });
      }
    }
    fail(404, "Endpoint not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          error: "Check the submitted fields",
          fields: e.issues.map((x) => ({ path: x.path, message: x.message })),
        },
        400,
      );
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e.code === "40001" || e.code === "23505")
    )
      return json(
        { error: "Conflicting request. Refresh and try again." },
        409,
      );
    // Never log request bodies, tokens, URLs, or arbitrary provider error messages.
    console.error("request_failed", {
      type: e instanceof Error ? e.name : "unknown",
    });
    return json(
      { error: "The request could not be completed. Please retry." },
      500,
    );
  }
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
