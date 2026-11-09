import type {DatabaseSync} from "node:sqlite";
import {nip19} from "nostr-tools";

export const GUIDE_CONVERSATION_GAP=24*60*60;
/** Private aggregate metadata only: no chat contents, ciphertext or wallet details. */
export function syncGuideConversations(db:DatabaseSync){
 db.exec("CREATE TABLE IF NOT EXISTS guide_conversation_totals(sender TEXT PRIMARY KEY,conversations INTEGER NOT NULL,last_activity INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS guide_conversation_counted(message_id TEXT PRIMARY KEY)");
 db.exec("BEGIN IMMEDIATE");
 try{
  const rows=db.prepare("SELECT m.id,m.sender,m.received_at FROM support_message m LEFT JOIN guide_conversation_counted c ON c.message_id=m.id WHERE c.message_id IS NULL ORDER BY m.received_at,m.id LIMIT 1000").all() as {id:string;sender:string;received_at:number}[];
  for(const row of rows){
   if(!/^[0-9a-f]{64}$/.test(row.id)||!/^[0-9a-f]{64}$/.test(row.sender)||!Number.isSafeInteger(row.received_at)||row.received_at<0)throw new Error("Invalid Guide conversation metadata.");
   db.prepare("INSERT INTO guide_conversation_counted VALUES (?)").run(row.id);
   db.prepare("INSERT INTO guide_conversation_totals VALUES (?,1,?) ON CONFLICT(sender) DO UPDATE SET conversations=conversations+CASE WHEN excluded.last_activity-last_activity>=? THEN 1 ELSE 0 END,last_activity=MAX(last_activity,excluded.last_activity)").run(row.sender,row.received_at,GUIDE_CONVERSATION_GAP);
  }
  db.exec("COMMIT");return rows.length;
 }catch(error){db.exec("ROLLBACK");throw error;}
}

export function guideConversationLeaderboard(db:DatabaseSync,limit=20){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Use a leaderboard limit from 1 to 100.");
 const rows=db.prepare("SELECT sender,conversations FROM guide_conversation_totals ORDER BY conversations DESC,sender LIMIT ?").all(limit) as {sender:string;conversations:number}[];
 return rows.map((row,index)=>({rank:index+1,npub:nip19.npubEncode(row.sender),conversations:row.conversations}));
}
