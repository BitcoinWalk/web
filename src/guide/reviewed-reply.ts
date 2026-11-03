import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {getPublicKey,type Event} from "nostr-tools";
import {wrapAlert} from "./core";

export const reviewedReplySchema=z.object({caseId:z.string().regex(/^[0-9a-f]{64}$/),messageIds:z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1).max(1000),reply:z.string().trim().min(1).max(4000).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))}).strict();
export function prepareReviewedReply(db:DatabaseSync,input:unknown,secret:Uint8Array){
 const review=reviewedReplySchema.parse(input),digest=createHash("sha256").update(JSON.stringify(review)).digest("hex");
 db.exec("CREATE TABLE IF NOT EXISTS support_reply (case_id TEXT PRIMARY KEY,digest TEXT NOT NULL,recipient TEXT NOT NULL,wrapped TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','acknowledged')))");
 db.exec("BEGIN IMMEDIATE");
 try{
  const row=db.prepare("SELECT sender,state FROM support_case WHERE id=?").get(review.caseId) as {sender:string;state:string}|undefined;
  if(!row||row.state!=="open"||row.sender===getPublicKey(secret))throw new Error("Reviewed reply requires an open recipient case.");
  const messages=db.prepare("SELECT id FROM support_message WHERE case_id=? ORDER BY created_at,id").all(review.caseId) as {id:string}[];
  if(JSON.stringify(messages.map(message=>message.id))!==JSON.stringify(review.messageIds))throw new Error("Case messages changed; review the latest conversation first.");
  let saved=db.prepare("SELECT digest,recipient,wrapped,state FROM support_reply WHERE case_id=?").get(review.caseId) as {digest:string;recipient:string;wrapped:string;state:string}|undefined;
  if(saved&&(saved.digest!==digest||saved.recipient!==row.sender))throw new Error("This case already has a different reviewed reply.");
  if(!saved){const wrapped=JSON.stringify(wrapAlert(review.reply,row.sender,secret).recipient);db.prepare("INSERT INTO support_reply VALUES (?,?,?,?,'pending')").run(review.caseId,digest,row.sender,wrapped);saved={digest,recipient:row.sender,wrapped,state:"pending"};}
  db.exec("COMMIT");return {caseId:review.caseId,recipient:saved.recipient,wrapped:JSON.parse(saved.wrapped) as Event,acknowledged:saved.state==="acknowledged"};
 }catch(error){db.exec("ROLLBACK");throw error;}
}
