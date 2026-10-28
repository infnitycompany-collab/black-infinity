import test from "node:test";
import assert from "node:assert/strict";
import { database, id, one } from "../src/lib/db";
import { qualifyRewards } from "../src/lib/rewards";
process.env.DATA_DIR = `.data/unit-${crypto.randomUUID()}`;
test("reward qualification is idempotent and reserves paired grants transactionally", async () => {
  const db = await database();
  const inviter = id(),
    friend = id();
  for (const uid of [inviter, friend]) {
    await db.query(
      "INSERT INTO users(id,alias,referral_code,invite_consumed,created_at) VALUES($1,'Test',$2,true,now()-interval '8 days')",
      [uid, id()],
    );
    await db.query(
      "INSERT INTO credentials(id,user_id,public_key,counter,transports) VALUES($1,$2,'test',0,'[]')",
      [id(), uid],
    );
  }
  await db.query("UPDATE users SET inviter_id=$2 WHERE id=$1", [
    friend,
    inviter,
  ]);
  await db.query(
    "INSERT INTO referral_qualifications(user_id,inviter_id) VALUES($1,$2)",
    [friend, inviter],
  );
  await db.query(
    "INSERT INTO media(id,user_id,mode,name,mime,size,status,completed_at) VALUES($1,$2,'vault','Encrypted media','application/octet-stream',1,'ready',now()-interval '8 days')",
    [id(), friend],
  );
  assert.equal(await qualifyRewards(), 3);
  assert.equal(await qualifyRewards(), 0);
  assert.equal(
    Number((await one("SELECT count(*) AS n FROM reward_ledger"))?.n),
    3,
  );
  const friend2 = id();
  await db.query(
    "INSERT INTO users(id,alias,referral_code,invite_consumed,inviter_id,created_at) VALUES($1,'Test',$2,true,$3,now()-interval '8 days')",
    [friend2, id(), inviter],
  );
  await db.query(
    "INSERT INTO credentials(id,user_id,public_key,counter,transports) VALUES($1,$2,'test',0,'[]')",
    [id(), friend2],
  );
  await db.query(
    "INSERT INTO referral_qualifications(user_id,inviter_id) VALUES($1,$2)",
    [friend2, inviter],
  );
  await db.query(
    "INSERT INTO media(id,user_id,mode,name,mime,size,status,completed_at) VALUES($1,$2,'vault','Encrypted media','application/octet-stream',1,'ready',now()-interval '8 days')",
    [id(), friend2],
  );
  await db.query(
    "INSERT INTO reward_ledger(id,user_id,event_key,kind,state,cost_cents,expires_at) VALUES($1,$2,$3,'test','granted',498,now()+interval '30 days')",
    [id(), inviter, id()],
  );
  assert.equal(await qualifyRewards(), 0, "Unfunded awards are never promised");
});
