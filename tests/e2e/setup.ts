import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { spawnSync } from "node:child_process";
export default async function setup() {
  const directory = process.env.BI_E2E_DIR!;
  await mkdir(directory, { recursive: true });
  const db = new PGlite(`${directory}/postgres`);
  await db.waitReady;
  await db.exec(await readFile("src/lib/schema.sql", "utf8"));
  const invites = [];
  for (const role of ["owner", "user", "user", "owner", "user"]) {
    const code = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO invites(hash,role,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [createHash("sha256").update(code).digest("hex"), role],
    );
    invites.push(code);
  }
  await writeFile(".data/e2e-invites.json", JSON.stringify(invites));
  await db.close();
  const r = spawnSync(
    ffmpeg.path,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=15",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      ".data/test-video.mp4",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  if (r.status !== 0) throw new Error("Test video generation failed");
  await writeFile(
    ".data/resume-video.mp4",
    Buffer.concat([
      await readFile(".data/test-video.mp4"),
      Buffer.alloc(5 * 1024 * 1024),
    ]),
  );
}
