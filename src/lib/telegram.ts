import { database, one, id } from "./db";
import { CHUNK, GB, PLANS } from "./policy";
import { putChunk, removeMedia } from "./storage";
export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET,
  );
}
export async function telegramCall(
  method: string,
  data: Record<string, unknown>,
) {
  if (!telegramConfigured()) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const r = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  const p = await r.json();
  if (!r.ok || !p.ok) throw new Error("TELEGRAM_REQUEST_FAILED");
  return p.result;
}
export async function importTelegram(payload: {
  userId: string;
  fileId: string;
  mediaId: string;
}) {
  const db = await database();
  const m = await one(
    "SELECT m.* FROM media m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND m.user_id=$2 AND u.deleted_at IS NULL AND NOT u.suspended",
    [payload.mediaId, payload.userId],
  );
  if (!m) throw new Error("ACCOUNT_UNAVAILABLE");
  if (m.status === "ready") return;
  const file = await telegramCall("getFile", { file_id: payload.fileId });
  if (
    !file.file_path ||
    !/^[-a-zA-Z0-9_./]+$/.test(file.file_path) ||
    file.file_path.includes("..")
  )
    throw new Error("TELEGRAM_FILE_UNAVAILABLE");
  const response = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    {
      signal: AbortSignal.timeout(120000),
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!response.ok || !response.body)
    throw new Error("TELEGRAM_FILE_UNAVAILABLE");
  const reader = response.body.getReader();
  let chunk = new Uint8Array(CHUNK),
    filled = 0,
    total = 0,
    index = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      total += r.value.byteLength;
      if (total > Number(m.size)) {
        await reader.cancel();
        throw new Error("TELEGRAM_FILE_SIZE_CHANGED");
      }
      let offset = 0;
      while (offset < r.value.byteLength) {
        const take = Math.min(CHUNK - filled, r.value.byteLength - offset);
        chunk.set(r.value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === CHUNK) {
          await putChunk(m.id, index++, chunk);
          chunk = new Uint8Array(CHUNK);
          filled = 0;
        }
      }
    }
    if (total !== Number(m.size)) throw new Error("TELEGRAM_FILE_SIZE_CHANGED");
    if (filled) await putChunk(m.id, index++, chunk.subarray(0, filled));
    await db.transaction(async (tx) => {
      const active = await one(
        "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended",
        [payload.userId],
        tx,
      );
      if (!active) throw new Error("ACCOUNT_UNAVAILABLE");
      await tx.query(
        "UPDATE media SET status='ready',stored_size=size,completed_at=now() WHERE id=$1",
        [m.id],
      );
      await tx.query(
        "INSERT INTO notifications(id,user_id,kind,message) VALUES($1,$2,'import','Your Telegram import is ready in managed streaming.')",
        [id(), payload.userId],
      );
    });
  } catch (e) {
    await removeMedia(m.id, index);
    throw e;
  }
}
export async function queueTelegramMedia(
  userId: string,
  file: {
    file_id: string;
    file_size: number;
    file_name?: string;
    mime_type?: string;
  },
) {
  if (
    !file.file_size ||
    file.file_size > 20_000_000 ||
    !file.mime_type ||
    !/^(video|audio)\/[a-z0-9.+-]+$/i.test(file.mime_type)
  )
    throw new Error("TELEGRAM_FILE_UNSUPPORTED");
  const db = await database();
  await db.transaction(async (tx) => {
    const u = await one(
      "SELECT id,plan FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended FOR UPDATE",
      [userId],
      tx,
    );
    if (!u) throw new Error("ACCOUNT_UNAVAILABLE");
    const usage = await one(
      "SELECT coalesce(sum(size),0) AS n FROM media WHERE user_id=$1",
      [userId],
      tx,
    );
    const plan = PLANS[u.plan as keyof typeof PLANS] || PLANS.free;
    if (Number(usage?.n) + file.file_size > plan.gb * GB)
      throw new Error("STORAGE_ALLOWANCE_REACHED");
    const mediaId = id();
    await tx.query(
      "INSERT INTO media(id,user_id,mode,name,mime,size,status,chunk_count) VALUES($1,$2,'managed',$3,$4,$5,'importing',$6)",
      [
        mediaId,
        userId,
        (file.file_name || "Telegram media").slice(0, 255),
        file.mime_type,
        file.file_size,
        Math.ceil(file.file_size / CHUNK),
      ],
    );
    await tx.query(
      "INSERT INTO jobs(id,kind,payload) VALUES($1,'telegram-import',$2)",
      [id(), JSON.stringify({ userId, fileId: file.file_id, mediaId })],
    );
  });
}
