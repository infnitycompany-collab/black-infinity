import { database, id } from "../src/lib/db";
import { token, hash } from "../src/lib/security";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from 'sharp';
import webpush from "web-push";
async function main() {
  const db = await database();
  const existing = await db.query("SELECT hash FROM invites WHERE role=$1", [
    "owner",
  ]);
  const data = path.resolve(process.env.DATA_DIR || ".data");
  await mkdir(data, { recursive: true });
  if (!existing.rows.length) {
    const raw = token();
    await db.query(
      "INSERT INTO invites(hash,role,expires_at) VALUES($1,'owner',now()+interval '7 days')",
      [hash(raw)],
    );
    await writeFile(
      path.join(data, "owner-invitation.txt"),
      `Black Infinity owner invitation\n\n${raw}\n\nUse at http://localhost:3000/login?register=1\nExpires in seven days. Single use. Do not share or commit.\n`,
      { mode: 0o600 },
    );
    console.log(
      "Owner invitation saved privately to .data/owner-invitation.txt",
    );
  }
  const post = await db.query("SELECT id FROM posts LIMIT 1");
  if (!post.rows.length) {
    await db.query(
      "INSERT INTO posts(id,slug,title,body,published) VALUES($1,$2,$3,$4,true)",
      [
        id(),
        "a-clearer-kind-of-privacy",
        "A clearer kind of privacy",
        "Black Infinity begins with a simple principle: privacy should be understandable.\n\nOur vault encrypts media on your device. Managed streaming is a separate mode that lets the service process files. We label the difference because trust depends on knowing where the boundary is.\n\nThis is an invitation-only development beta. Independent encryption review, verified infrastructure retention, and external provider access remain release gates. No complete anonymity or certification is claimed.",
      ],
    );
  }
  const icons = path.resolve("public");
  for (const size of [192, 512, 180]) await sharp(path.join(icons,'icon.svg')).resize(size,size).png().toFile(path.join(icons,size===180?'apple-touch-icon.png':`icon-${size}.png`));
  const vapid = webpush.generateVAPIDKeys();
  await writeFile(
    path.join(data, "vapid.env"),
    `VAPID_PUBLIC_KEY=${vapid.publicKey}\nVAPID_PRIVATE_KEY=${vapid.privateKey}\nVAPID_SUBJECT=mailto:REPLACE_WITH_VERIFIED_CONTACT\n`,
    { mode: 0o600, flag: "wx" },
  ).catch(() => {});
  console.log(
    "Database initialized. Payments and provider adapters remain disabled.",
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Setup failed:", e.name);
    process.exit(1);
  });
