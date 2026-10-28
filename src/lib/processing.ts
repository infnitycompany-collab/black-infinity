import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, open, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";
import { database, one, id } from "./db";
import { CHUNK, GB, PLANS } from "./policy";
import { getChunk, putChunk, removeMedia } from "./storage";
function execute(
  binary: string,
  args: string[],
  timeout = 300000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        PATH: process.env.PATH || "",
        SystemRoot: process.env.SystemRoot || "",
        TEMP: process.env.TEMP || "",
        TMP: process.env.TMP || "",
        LANG: "C",
      },
    });
    let output = "";
    p.stdout.on("data", (chunk) => {
      if (output.length < 100000) output += chunk.toString();
    });
    p.on("error", () => reject(new Error("MEDIA_TOOL_UNAVAILABLE")));
    p.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error("MEDIA_PROCESSING_FAILED")),
    );
  });
}
export async function processMedia(payload: {
  mediaId: string;
  userId: string;
  outputId: string;
  height: number;
}) {
  const db = await database(),
    source = await one(
      "SELECT * FROM media WHERE id=$1 AND user_id=$2 AND mode='managed' AND deleted_at IS NULL AND status='ready'",
      [payload.mediaId, payload.userId],
    );
  if (!source) throw new Error("SOURCE_UNAVAILABLE");
  const existing = await one("SELECT id,status FROM media WHERE id=$1", [
    payload.outputId,
  ]);
  if (existing?.status === "ready") return;
  const dir = await mkdtemp(path.join(tmpdir(), "black-infinity-"));
  const input = path.join(dir, "source"),
    output = path.join(dir, "compatible.mp4");
  let outputChunks = 0;
  try {
    const handle = await open(input, "w", 0o600);
    try {
      for (let i = 0; i < source.chunk_count; i++)
        await handle.write(await getChunk(source.id, i));
    } finally {
      await handle.close();
    }
    const probe = JSON.parse(
      await execute(
        process.env.FFPROBE_PATH || ffprobe.path,
        [
          "-v",
          "quiet",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "mov,matroska,webm,avi,mp3,wav,ogg,flac,mpegvideo,mpegts,aac",
          "-show_format",
          "-of",
          "json",
          input,
        ],
        30000,
      ),
    );
    const duration = Number(probe.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 36000)
      throw new Error("MEDIA_DURATION_UNSUPPORTED");
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        payload.userId,
      ]);
      const u = await one(
        "SELECT plan FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended",
        [payload.userId],
        tx,
      );
      if (!u) throw new Error("ACCOUNT_UNAVAILABLE");
      const p = PLANS[u.plan as keyof typeof PLANS] || PLANS.free;
      const usage = await one(
        "SELECT coalesce(sum(seconds),0) AS n FROM processing_usage WHERE user_id=$1 AND created_at>=date_trunc('month',now())",
        [payload.userId],
        tx,
      );
      const old = await one(
        "SELECT job_key FROM processing_usage WHERE job_key=$1",
        [payload.outputId],
        tx,
      );
      if (!old && Number(usage?.n) + duration > p.minutes * 60)
        throw new Error("PROCESSING_ALLOWANCE_REACHED");
      if (!old)
        await tx.query(
          "INSERT INTO processing_usage(job_key,user_id,seconds) VALUES($1,$2,$3)",
          [payload.outputId, payload.userId, Math.ceil(duration)],
        );
      const storage = await one(
        "SELECT coalesce(sum(size),0) AS n FROM media WHERE user_id=$1",
        [payload.userId],
        tx,
      );
      if (Number(storage?.n) + Number(source.size) * 2 > p.gb * GB)
        throw new Error("STORAGE_ALLOWANCE_REACHED");
    });
    // Inputs are local files; network protocols and shell execution are disabled.
    await execute(process.env.FFMPEG_PATH || ffmpeg.path, [
      "-y",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,matroska,webm,avi,mp3,wav,ogg,flac,mpegvideo,mpegts,aac",
      "-i",
      input,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=-2:min(${payload.height}\\,ih)`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "25",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-fs",
      String(Math.min(GB, Number(source.size) * 2)),
      output,
    ]);
    const info = await stat(output);
    if (info.size < 1 || info.size >= Math.min(GB, Number(source.size) * 2))
      throw new Error("OUTPUT_LIMIT_REACHED");
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        payload.userId,
      ]);
      if (
        !(await one(
          "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended",
          [payload.userId],
          tx,
        ))
      )
        throw new Error("ACCOUNT_UNAVAILABLE");
      const u = await one(
        "SELECT plan FROM users WHERE id=$1",
        [payload.userId],
        tx,
      );
      const usage = await one(
        "SELECT coalesce(sum(size),0) AS n FROM media WHERE user_id=$1",
        [payload.userId],
        tx,
      );
      if (
        Number(usage?.n) + info.size >
        (PLANS[u!.plan as keyof typeof PLANS] || PLANS.free).gb * GB
      )
        throw new Error("STORAGE_ALLOWANCE_REACHED");
      await tx.query(
        "INSERT INTO media(id,user_id,mode,name,mime,size,status,chunk_count) VALUES($1,$2,'managed',$3,'video/mp4',$4,'processing',$5) ON CONFLICT(id) DO UPDATE SET status='processing'",
        [
          payload.outputId,
          payload.userId,
          `${source.name} · ${payload.height}p`,
          info.size,
          Math.ceil(info.size / CHUNK),
        ],
      );
    });
    const f = await open(output, "r");
    try {
      for (let idx = 0; idx < Math.ceil(info.size / CHUNK); idx++) {
        const b = Buffer.alloc(Math.min(CHUNK, info.size - idx * CHUNK));
        await f.read(b, 0, b.length, idx * CHUNK);
        await putChunk(payload.outputId, idx, b);
        outputChunks++;
      }
    } finally {
      await f.close();
    }
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE media SET status='ready',stored_size=size,completed_at=now() WHERE id=$1",
        [payload.outputId],
      );
      await tx.query(
        "INSERT INTO notifications(id,user_id,kind,message) VALUES($1,$2,'processing','Your compatible media version is ready.')",
        [id(), payload.userId],
      );
    });
  } catch (e) {
    if (outputChunks) await removeMedia(payload.outputId, outputChunks);
    await db.query("DELETE FROM media WHERE id=$1 AND status='processing'", [
      payload.outputId,
    ]);
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
