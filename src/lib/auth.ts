import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database, id, one } from "./db";
import {
  hash,
  token,
  origin,
  fail,
  user,
  body,
  limit,
  newSession,
  sessionResponse,
  audit,
} from "./security";
const rp = () => process.env.RP_ID || new URL(origin()).hostname;
async function challenge(data: any) {
  const raw = token();
  await (
    await database()
  ).query(
    "INSERT INTO challenges(hash,data,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
    [hash(raw), JSON.stringify(data)],
  );
  return raw;
}
function withChallenge(data: any, raw: string) {
  const r = NextResponse.json(data);
  r.cookies.set("bi_challenge", raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: origin().startsWith("https:"),
    path: "/",
    maxAge: 300,
  });
  return r;
}
async function consume(req: NextRequest, kind: string) {
  const raw = req.cookies.get("bi_challenge")?.value || "";
  const row = await one(
    "DELETE FROM challenges WHERE hash=$1 AND expires_at>now() RETURNING data",
    [hash(raw)],
  );
  if (!row || row.data.kind !== kind)
    fail(400, "Challenge expired. Please start again.");
  return row!.data;
}
export async function auth(req: NextRequest, path: string) {
  await limit(`auth:${path}`, 100, 60);
  const db = await database();
  if (path === "register/options") {
    const input = z
      .object({
        alias: z.string().trim().min(2).max(40),
        invite: z.string().min(20).max(150),
        referral: z.string().max(80).optional(),
        adult: z.literal(true),
      })
      .parse(await body(req));
    const invite = await one(
      "SELECT hash FROM invites WHERE hash=$1 AND consumed_by IS NULL AND expires_at>now()",
      [hash(input.invite)],
    );
    if (!invite) fail(400, "Invitation is invalid or expired");
    const uid = id();
    const options = await generateRegistrationOptions({
      rpName: "Black Infinity",
      rpID: rp(),
      userName: input.alias,
      userID: new TextEncoder().encode(uid),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    return withChallenge(
      options,
      await challenge({
        kind: "register",
        uid,
        ...input,
        invite: hash(input.invite),
        challenge: options.challenge,
      }),
    );
  }
  if (path === "register/verify") {
    const c = await consume(req, "register");
    const response = await body(req);
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge: c.challenge,
      expectedOrigin: origin(),
      expectedRPID: rp(),
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo)
      fail(400, "Passkey registration failed");
    const cred = v.registrationInfo!.credential;
    const codes = Array.from({ length: 8 }, () => token());
    await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(125235)");
      const count = await one(
        "SELECT count(*) AS n FROM users WHERE deleted_at IS NULL",
        [],
        tx,
      );
      if (Number(count?.n) >= 25) fail(409, "The beta is full");
      const invite = await one(
        "SELECT * FROM invites WHERE hash=$1 AND consumed_by IS NULL AND expires_at>now() FOR UPDATE",
        [c.invite],
        tx,
      );
      if (!invite) fail(409, "Invitation already consumed");
      const inviter = c.referral
        ? await one(
            "SELECT id FROM users WHERE referral_code=$1 AND deleted_at IS NULL AND NOT suspended",
            [c.referral],
            tx,
          )
        : null;
      await tx.query(
        "INSERT INTO users(id,alias,role,referral_code,inviter_id,invite_consumed) VALUES($1,$2,$3,$4,$5,true)",
        [
          c.uid,
          c.alias,
          invite!.role,
          token().slice(0, 16),
          inviter?.id || null,
        ],
      );
      await tx.query("UPDATE invites SET consumed_by=$2 WHERE hash=$1", [
        c.invite,
        c.uid,
      ]);
      await tx.query(
        "INSERT INTO credentials(id,user_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5)",
        [
          cred.id,
          c.uid,
          Buffer.from(cred.publicKey).toString("base64"),
          cred.counter,
          JSON.stringify(cred.transports || []),
        ],
      );
      for (const code of codes)
        await tx.query(
          "INSERT INTO recovery_codes(hash,user_id) VALUES($1,$2)",
          [hash(code), c.uid],
        );
      await tx.query(
        "INSERT INTO referral_qualifications(user_id,inviter_id) VALUES($1,$2)",
        [c.uid, inviter?.id || null],
      );
    });
    return sessionResponse(
      { ok: true, recoveryCodes: codes },
      await newSession(c.uid),
    );
  }
  if (path === "login/options") {
    const options = await generateAuthenticationOptions({
      rpID: rp(),
      userVerification: "required",
    });
    return withChallenge(
      options,
      await challenge({ kind: "login", challenge: options.challenge }),
    );
  }
  if (path === "login/verify") {
    const c = await consume(req, "login"),
      response = await body(req);
    const cred = await one(
      "SELECT c.* FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.id=$1 AND u.deleted_at IS NULL AND NOT u.suspended",
      [String(response.id)],
    );
    if (!cred) fail(400, "Passkey not recognized");
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: c.challenge,
      expectedOrigin: origin(),
      expectedRPID: rp(),
      requireUserVerification: true,
      credential: {
        id: cred!.id,
        publicKey: Buffer.from(cred!.public_key, "base64"),
        counter: Number(cred!.counter),
        transports: cred!.transports,
      },
    });
    if (!v.verified) fail(400, "Passkey verification failed");
    await db.query("UPDATE credentials SET counter=$2 WHERE id=$1", [
      cred!.id,
      v.authenticationInfo.newCounter,
    ]);
    return sessionResponse({ ok: true }, await newSession(cred!.user_id));
  }
  if (path === "recover") {
    await limit("recovery", 10, 3600);
    const { code } = z
      .object({ code: z.string().min(32).max(100) })
      .parse(await body(req));
    const c = await one(
      "DELETE FROM recovery_codes WHERE hash=$1 RETURNING user_id",
      [hash(code)],
    );
    if (!c) fail(400, "Invalid recovery code");
    const u = await one(
      "SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND NOT suspended",
      [c!.user_id],
    );
    if (!u) fail(400, "Account unavailable");
    await db.query("DELETE FROM sessions WHERE user_id=$1", [u!.id]);
    const raw = await newSession(u!.id);
    await db.query(
      "UPDATE sessions SET verified_at='1970-01-01' WHERE hash=$1",
      [hash(raw)],
    );
    return sessionResponse({ ok: true, recovered: true }, raw);
  }
  if (path === "passkey/options") {
    const u = await user(req);
    const creds = (
      await db.query("SELECT id,transports FROM credentials WHERE user_id=$1", [
        u.id,
      ])
    ).rows;
    const options = await generateRegistrationOptions({
      rpName: "Black Infinity",
      rpID: rp(),
      userName: u.alias,
      userID: new TextEncoder().encode(u.id),
      excludeCredentials: creds as any,
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    return withChallenge(
      options,
      await challenge({
        kind: "add-key",
        uid: u.id,
        challenge: options.challenge,
      }),
    );
  }
  if (path === "passkey/verify") {
    const u = await user(req),
      c = await consume(req, "add-key");
    if (c.uid !== u.id) fail(403, "Account mismatch");
    const v = await verifyRegistrationResponse({
      response: await body(req),
      expectedChallenge: c.challenge,
      expectedOrigin: origin(),
      expectedRPID: rp(),
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo)
      fail(400, "Passkey registration failed");
    const cred = v.registrationInfo!.credential;
    await db.query(
      "INSERT INTO credentials(id,user_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5)",
      [
        cred.id,
        u.id,
        Buffer.from(cred.publicKey).toString("base64"),
        cred.counter,
        JSON.stringify(cred.transports || []),
      ],
    );
    await audit(u.id, "passkey.add");
    return NextResponse.json({ ok: true });
  }
  if (path === "logout") {
    const raw = req.cookies.get("bi_session")?.value;
    if (raw) await db.query("DELETE FROM sessions WHERE hash=$1", [hash(raw)]);
    const r = NextResponse.json({ ok: true });
    r.cookies.delete("bi_session");
    return r;
  }
  fail(404, "Unknown authentication endpoint");
}
