import { database, id, one } from "../src/lib/db";
import { removeMedia } from "../src/lib/storage";
import { qualifyRewards } from "../src/lib/rewards";
import webpush from "web-push";
import { processMedia } from "../src/lib/processing";
import { importTelegram } from "../src/lib/telegram";
async function deleteAccount(userId: string) {
  const db = await database();
  const objects = (
    await db.query("SELECT id,chunk_count FROM media WHERE user_id=$1", [
      userId,
    ])
  ).rows;
  for (const m of objects) await removeMedia(m.id, m.chunk_count);
  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM shares WHERE owner_id=$1 OR recipient_id=$1", [
      userId,
    ]);
    await tx.query("DELETE FROM external_links WHERE user_id=$1", [userId]);
    await tx.query(
      "DELETE FROM chunks WHERE media_id IN(SELECT id FROM media WHERE user_id=$1)",
      [userId],
    );
    await tx.query("DELETE FROM media WHERE user_id=$1", [userId]);
    for (const table of [
      "credentials",
      "recovery_codes",
      "sessions",
      "notifications",
      "push_subscriptions",
      "playlists",
      "folders",
      "appeals",
      "telegram_links",
      "processing_usage",
      "referral_qualifications",
      "reward_ledger",
    ])
      await tx.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId]);
    await tx.query(
      "DELETE FROM campaign_visits WHERE campaign_id IN(SELECT id FROM campaigns WHERE user_id=$1)",
      [userId],
    );
    await tx.query("DELETE FROM campaigns WHERE user_id=$1", [userId]);
    await tx.query("DELETE FROM partners WHERE user_id=$1", [userId]);
    await tx.query("UPDATE users SET inviter_id=NULL WHERE inviter_id=$1", [
      userId,
    ]);
    await tx.query(
      "UPDATE referral_qualifications SET inviter_id=NULL WHERE inviter_id=$1",
      [userId],
    );
    await tx.query(
      "UPDATE jobs SET status='cancelled',payload='{}' WHERE kind<>'delete-account' AND payload->>'userId'=$1",
      [userId],
    );
    await tx.query(
      "UPDATE users SET alias='Deleted account',referral_code=$2,vault_public_key=NULL,vault_wrapped=NULL WHERE id=$1 AND deleted_at IS NOT NULL",
      [userId, id()],
    );
  });
}
async function push(userId: string) {
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  )
    throw new Error("PUSH_NOT_CONFIGURED");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const db = await database();
  const subs = (
    await db.query(
      "SELECT endpoint_hash,subscription FROM push_subscriptions WHERE user_id=$1",
      [userId],
    )
  ).rows;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        s.subscription,
        JSON.stringify({ type: "update" }),
        { TTL: 3600, timeout: 10000 },
      );
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410)
        await db.query(
          "DELETE FROM push_subscriptions WHERE endpoint_hash=$1",
          [s.endpoint_hash],
        );
      else throw new Error("PUSH_DELIVERY_FAILED");
    }
  }
}
export async function tick() {
  const db = await database();
  await db.query(
    "UPDATE jobs SET status='pending',leased_at=NULL WHERE status='running' AND leased_at<now()-interval '10 minutes'",
  );
  const job = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(125239)");
    const n = await one(
      "SELECT count(*) AS n FROM jobs WHERE status='running'",
      [],
      tx,
    );
    if (Number(n?.n) >= 2) return null;
    const j = await one(
      "SELECT * FROM jobs WHERE status='pending' AND available_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      [],
      tx,
    );
    if (!j) return null;
    await tx.query(
      "UPDATE jobs SET status='running',leased_at=now(),attempts=attempts+1 WHERE id=$1",
      [j.id],
    );
    return j;
  });
  if (job) {
    try {
      if (job.kind === "delete-account")
        await deleteAccount(job.payload.userId);
      else if (job.kind === "push") await push(job.payload.userId);
      else if (job.kind === "transcode") await processMedia(job.payload);
      else if (job.kind === "telegram-import")
        await importTelegram(job.payload);
      else throw new Error("UNKNOWN_JOB");
      await db.query(
        "UPDATE jobs SET status='completed',payload='{}',last_error=NULL WHERE id=$1",
        [job.id],
      );
    } catch (e) {
      await db.query(
        "UPDATE jobs SET status=$2,available_at=now()+interval '5 minutes',last_error=$3 WHERE id=$1",
        [
          job.id,
          job.attempts >= 4 ? "failed" : "pending",
          e instanceof Error && /^[A-Z_]+$/.test(e.message)
            ? e.message
            : "JOB_FAILED",
        ],
      );
    }
  }
  await qualifyRewards();
  await db.query("DELETE FROM audit WHERE created_at<now()-interval '30 days'");
  await db.query(
    "DELETE FROM telegram_updates WHERE created_at<now()-interval '30 days'",
  );
  await db.query(
    "DELETE FROM jobs WHERE status IN('completed','cancelled') AND created_at<now()-interval '30 days'",
  );
  await db.query("DELETE FROM challenges WHERE expires_at<now()");
  await db.query("DELETE FROM rate_limits WHERE expires_at<now()");
  await db.query("DELETE FROM sessions WHERE expires_at<now()");
  await db.query("DELETE FROM campaign_visits WHERE day<current_date-30");
  const expired = (
    await db.query(
      "SELECT id,chunk_count FROM media WHERE status='uploading' AND upload_expires_at<now() OR deleted_at<now()-interval '30 days' LIMIT 20",
    )
  ).rows;
  for (const m of expired) {
    await removeMedia(m.id, m.chunk_count);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM shares WHERE media_id=$1", [m.id]);
      await tx.query("DELETE FROM external_links WHERE media_id=$1", [m.id]);
      await tx.query("DELETE FROM media WHERE id=$1", [m.id]);
    });
  }
  return Boolean(job);
}
async function main() {
  console.log("Black Infinity worker running. No request content is logged.");
  while (true) {
    await tick().catch(() => console.error("worker_tick_failed"));
    if (process.argv.includes("--once")) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  process.exit(0);
}
if (process.argv[1]?.endsWith("worker.ts")) main();
