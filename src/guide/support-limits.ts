import type {DatabaseSync} from "node:sqlite";

export type GuidePlan="basic"|"pro";
export const GUIDE_BASIC_REPLIES=3,GUIDE_BREAK_SECONDS=24*60*60;
export function initializeGuideLimits(db:DatabaseSync){
 db.exec("CREATE TABLE IF NOT EXISTS support_usage (recipient TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0,cooldown_until INTEGER NOT NULL DEFAULT 0)");
 db.exec("CREATE TABLE IF NOT EXISTS support_reply_v2 (review_key TEXT PRIMARY KEY,case_id TEXT NOT NULL,message_key TEXT NOT NULL,digest TEXT NOT NULL,recipient TEXT NOT NULL,wrapped TEXT NOT NULL,plan TEXT NOT NULL,state TEXT NOT NULL,UNIQUE(case_id,message_key))");
}
export function assertGuideAllowance(db:DatabaseSync,recipient:string,plan:GuidePlan,now=Math.floor(Date.now()/1000)){
 initializeGuideLimits(db);if(plan==="pro")return;
 const row=db.prepare("SELECT used,cooldown_until FROM support_usage WHERE recipient=?").get(recipient) as {used:number;cooldown_until:number}|undefined;
 if(row?.cooldown_until&&now>=row.cooldown_until)db.prepare("UPDATE support_usage SET used=0,cooldown_until=0 WHERE recipient=?").run(recipient);
 else if(row?.cooldown_until)throw new Error(`Basic Guide replies resume at ${new Date(row.cooldown_until*1000).toISOString()}.`);
 const used=row?.cooldown_until?0:row?.used??0;
 const pending=db.prepare("SELECT COUNT(*) count FROM support_reply_v2 WHERE recipient=? AND plan='basic' AND state='pending'").get(recipient) as {count:number};
 if(used+pending.count>=GUIDE_BASIC_REPLIES)throw new Error("Three Basic replies are already delivered or reserved. Retry the existing delivery before preparing another reply.");
}
export function acknowledgeGuideReply(db:DatabaseSync,reviewKey:string,now=Math.floor(Date.now()/1000)){
 db.exec("BEGIN IMMEDIATE");
 try{
  const row=db.prepare("SELECT recipient,plan,state FROM support_reply_v2 WHERE review_key=?").get(reviewKey) as {recipient:string;plan:string;state:string}|undefined;
  if(!row)throw new Error("Reviewed reply was not found.");
  if(row.state!=="acknowledged"){
   if(row.plan==="basic"){
    db.prepare("INSERT OR IGNORE INTO support_usage(recipient) VALUES (?)").run(row.recipient);
    db.prepare("UPDATE support_usage SET used=used+1,cooldown_until=CASE WHEN used+1>=? THEN ? ELSE 0 END WHERE recipient=?").run(GUIDE_BASIC_REPLIES,now+GUIDE_BREAK_SECONDS,row.recipient);
   }
   db.prepare("UPDATE support_reply_v2 SET state='acknowledged' WHERE review_key=?").run(reviewKey);
  }
  db.exec("COMMIT");
 }catch(error){db.exec("ROLLBACK");throw error;}
}
