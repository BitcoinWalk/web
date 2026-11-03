import {getEventHash,getPublicKey,verifyEvent,type Event} from "nostr-tools";
import {unwrapEvent} from "nostr-tools/nip59";
import type {DatabaseSync} from "node:sqlite";

export type SupportCase={id:string;state:"open"|"closed";openedAt:number;updatedAt:number;messageCount:number};
export type SupportMessage={id:string;sender:string;content:string;createdAt:number;receivedAt:number};
function exactRecipient(tags:string[][],recipient:string){const values=tags.filter(tag=>tag[0]==="p");return values.length===1&&values[0][1]===recipient;}

export class GuideSupportCases{
 constructor(readonly db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS support_case (id TEXT PRIMARY KEY,sender TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('open','closed')),opened_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,closed_at INTEGER);
    CREATE INDEX IF NOT EXISTS support_case_sender_state ON support_case(sender,state);
    CREATE TABLE IF NOT EXISTS support_message (id TEXT PRIMARY KEY,case_id TEXT NOT NULL,wrap_id TEXT NOT NULL UNIQUE,sender TEXT NOT NULL,content TEXT NOT NULL,created_at INTEGER NOT NULL,received_at INTEGER NOT NULL,FOREIGN KEY(case_id) REFERENCES support_case(id));
    CREATE INDEX IF NOT EXISTS support_message_case ON support_message(case_id,created_at,id);`);
 }
 ingest(wrap:Event,secret:Uint8Array,now=Math.floor(Date.now()/1000),retentionDays=30):"created"|"duplicate"{
  const recipient=getPublicKey(secret),cutoff=now-retentionDays*86400;
  if(!verifyEvent(wrap)||wrap.kind!==1059||wrap.created_at<cutoff||wrap.created_at>now+60||!exactRecipient(wrap.tags,recipient))throw new Error("Invalid Guide support gift wrap.");
  const rumor=unwrapEvent(wrap,secret);
  if(rumor.kind!==14||rumor.pubkey===recipient||!/^[0-9a-f]{64}$/.test(rumor.pubkey)||rumor.id!==getEventHash(rumor)||rumor.created_at<cutoff||rumor.created_at>now+60||!exactRecipient(rumor.tags,recipient)||typeof rumor.content!=="string"||!rumor.content.trim()||rumor.content.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(rumor.content))throw new Error("Invalid Guide support message.");
  if(this.db.prepare("SELECT 1 FROM support_message WHERE id=? OR wrap_id=?").get(rumor.id,wrap.id))return "duplicate";
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const current=this.db.prepare("SELECT id FROM support_case WHERE sender=? AND state='open' ORDER BY opened_at DESC LIMIT 1").get(rumor.pubkey) as {id:string}|undefined,caseId=current?.id??rumor.id;
   if(!current)this.db.prepare("INSERT INTO support_case(id,sender,state,opened_at,updated_at) VALUES (?,?,'open',?,?)").run(caseId,rumor.pubkey,now,now);
   this.db.prepare("INSERT INTO support_message(id,case_id,wrap_id,sender,content,created_at,received_at) VALUES (?,?,?,?,?,?,?)").run(rumor.id,caseId,wrap.id,rumor.pubkey,rumor.content,rumor.created_at,now);
   this.db.prepare("UPDATE support_case SET updated_at=? WHERE id=?").run(now,caseId);
   this.db.exec("COMMIT");return "created";
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
 list():SupportCase[]{return (this.db.prepare("SELECT c.id,c.state,c.opened_at openedAt,c.updated_at updatedAt,COUNT(m.id) messageCount FROM support_case c JOIN support_message m ON m.case_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC").all() as SupportCase[]);}
 messages(caseId:string):SupportMessage[]{return this.db.prepare("SELECT id,sender,content,created_at createdAt,received_at receivedAt FROM support_message WHERE case_id=? ORDER BY created_at,id").all(caseId) as SupportMessage[];}
 close(caseId:string,now=Math.floor(Date.now()/1000)):boolean{return Number(this.db.prepare("UPDATE support_case SET state='closed',closed_at=?,updated_at=? WHERE id=? AND state='open'").run(now,now,caseId).changes)===1;}
 prune(now=Math.floor(Date.now()/1000),retentionDays=30):number{
  const cutoff=now-retentionDays*86400;this.db.exec("BEGIN IMMEDIATE");
  try{const cases=this.db.prepare("SELECT id FROM support_case WHERE updated_at<?").all(cutoff) as {id:string}[];for(const row of cases)this.db.prepare("DELETE FROM support_message WHERE case_id=?").run(row.id);const removed=Number(this.db.prepare("DELETE FROM support_case WHERE updated_at<?").run(cutoff).changes);this.db.exec("COMMIT");return removed;}catch(error){this.db.exec("ROLLBACK");throw error;}
 }
}
