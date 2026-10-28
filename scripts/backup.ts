import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
if (!process.env.DATABASE_URL || !process.env.BACKUP_RECIPIENT)
  throw new Error(
    "PostgreSQL DATABASE_URL and age BACKUP_RECIPIENT are required",
  );
await mkdir("backups", { recursive: true });
const target = path.resolve(
  "backups",
  `${new Date().toISOString().replace(/[:.]/g, "-")}.sql.age`,
);
// Keep credentials out of command arguments and output. pg_dump reads PG* environment variables.
const url = new URL(process.env.DATABASE_URL);
const dump = spawn("pg_dump", ["--no-owner", "--no-acl"], {
  env: {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "ignore"],
});
const age = spawn("age", ["-r", process.env.BACKUP_RECIPIENT], {
  windowsHide: true,
  stdio: ["pipe", "pipe", "ignore"],
});
dump.stdout.pipe(age.stdin);
const output = createWriteStream(target, { mode: 0o600 });
age.stdout.pipe(output);
await Promise.all([
  new Promise<void>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (c) =>
      c === 0 ? resolve() : reject(new Error("Database backup failed")),
    );
  }),
  new Promise<void>((resolve, reject) => {
    age.on("error", reject);
    age.on("close", (c) =>
      c === 0 ? resolve() : reject(new Error("Backup encryption failed")),
    );
  }),
  new Promise<void>((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  }),
]);
console.log(
  "Encrypted database backup created. Object-storage versioning and restore verification are separate required checks.",
);
