import fs from 'node:fs';
const file='src/lib/rewards.ts';const source=fs.readFileSync(file,'utf8');const head=String.raw`export async function qualifyRewards() {
 const db=await database();return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(125236)');
  const candidates=(await tx.query("SELECT u.id,u.inviter_id FROM users u JOIN referral_qualifications q ON q.user_id=u.id WHERE q.status='pending' AND u.deleted_at IS NULL AND NOT u.suspended AND u.invite_consumed AND u.created_at<=now()-interval '7 days' AND EXISTS(SELECT 1 FROM credentials c WHERE c.user_id=u.id) AND EXISTS(SELECT 1 FROM media m WHERE m.user_id=u.id AND m.status='ready' AND m.deleted_at IS NULL AND m.completed_at<=now()-interval '7 days')")).rows;
  let grants=0;let spent=Number((await one("SELECT coalesce(sum(cost_cents),0) AS n FROM reward_ledger WHERE state='granted' AND created_at>=date_trunc('month',now())",[],tx))?.n||0);
  const active=async(uid:string)=>Number((await one("SELECT coalesce(sum(gb),0) AS n FROM reward_ledger r WHERE user_id=$1 AND state='granted' AND expires_at>now() AND NOT EXISTS(SELECT 1 FROM reward_ledger x WHERE x.reverses_id=r.id AND x.state='reversed')",[uid],tx))?.n||0);
  async function grant(uid:string,key:string,kind:string){
   if(await one('SELECT id FROM reward_ledger WHERE event_key=$1',[key],tx))return true;
   if(spent+2>500||await active(uid)>=5)return false;
   await tx.query("INSERT INTO reward_ledger(id,user_id,event_key,kind,state,expires_at) VALUES($1,$2,$3,$4,'granted',now()+interval '30 days')",[id(),uid,key,kind]);
   await tx.query("INSERT INTO notifications(id,user_id,kind,message) VALUES($1,$2,'reward','Storage credit granted: 1 GB for 30 days.')",[id(),uid]);spent+=2;grants++;return true;
  }
  for(const u of candidates){
   if(!await grant(u.id,'onboarding:'+u.id,'onboarding'))continue;
   if(u.inviter_id){
    if(!await one('SELECT id FROM users WHERE id=$1 AND id<>$2 AND deleted_at IS NULL AND NOT suspended',[u.inviter_id,u.id],tx)){await tx.query("UPDATE referral_qualifications SET status='ineligible',reason='Referrer unavailable' WHERE user_id=$1",[u.id]);continue;}
    const referrals=Number((await one("SELECT count(*) AS n FROM reward_ledger WHERE user_id=$1 AND kind='referral-inviter' AND state='granted' AND created_at>now()-interval '30 days'",[u.inviter_id],tx))?.n||0);
    if(referrals>=5||spent+4>500||await active(u.id)>=5||await active(u.inviter_id)>=5)continue;
    await grant(u.id,'referral:'+u.id+':recipient','referral-recipient');await grant(u.inviter_id,'referral:'+u.id+':inviter','referral-inviter');
   }
   await tx.query("UPDATE referral_qualifications SET status='qualified',qualified_at=now() WHERE user_id=$1",[u.id]);
  }
  return grants;
 });
}
`;
fs.writeFileSync(file,source.replace(/export async function qualifyRewards\(\) \{[\s\S]*?(?=export async function rewardSummary)/,head));
