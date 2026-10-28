import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { database, one, type DB } from "./db";
export const origin = () => process.env.APP_ORIGIN || "http://localhost:3000";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
export function sameOrigin(req: NextRequest) {
  if (req.headers.get("origin") !== origin())
    fail(403, "Request origin rejected");
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function limit(key: string, max = 60, seconds = 60) {
  const db = await database();
  const row = await one(
    `INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.expires_at END RETURNING hits`,
    [hash(key), seconds],
    db,
  );
  if (Number(row?.hits) > max) fail(429, "Too many requests. Try again later.");
}
export async function user(req: NextRequest) {
  const raw = req.cookies.get("bi_session")?.value;
  if (!raw) fail(401, "Sign in required");
  const u = await one(
    `SELECT u.*,s.hash AS session_hash,s.verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL AND NOT u.suspended`,
    [hash(raw!)],
  );
  if (!u) fail(401, "Session expired");
  return u!;
}
export function requireAdmin(u: Record<string, any>) {
  if (!["owner", "support", "moderator"].includes(u.role))
    fail(403, "Administrator access required");
  requireRecent(u);
}
export function requireRecent(u: Record<string, any>) {
  if (Date.now() - new Date(u.verified_at).getTime() > 15 * 60_000)
    fail(403, "Sign in with your passkey again for recent verification");
}
export async function audit(
  actor: string,
  action: string,
  target?: string,
  db?: DB,
) {
  await (db || (await database())).query(
    "INSERT INTO audit(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
    [crypto.randomUUID(), actor, action, target || null],
  );
}
export async function newSession(userId: string) {
  const raw = token();
  await (
    await database()
  ).query(
    "INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [hash(raw), userId],
  );
  return raw;
}
export function sessionResponse(data: unknown, raw: string) {
  const r = NextResponse.json(data);
  r.cookies.set("bi_session", raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: origin().startsWith("https:"),
    path: "/",
    maxAge: 7 * 86400,
  });
  return r;
}
export async function body(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 256 * 1024)
    fail(413, "Request too large");
  const reader = req.body?.getReader();
  if (!reader) fail(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    length += value.length;
    if (length > 256 * 1024) {
      await reader!.cancel();
      fail(413, "Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    fail(400, "Invalid JSON");
  }
}
