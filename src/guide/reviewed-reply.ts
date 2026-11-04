import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {getPublicKey,type Event} from "nostr-tools";
import {wrapAlert} from "./core";
import {initializeGuideLimits,assertGuideAllowance,type GuidePlan} from "./support-limits";

export const reviewedReplySchema=z.object({caseId:z.string().regex(/^[0-9a-f]{64}$/),messageIds:z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1).max(1000),reply:z.string().trim().min(1).max(4000).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))}).strict();
export function prepareReviewedReply(db:DatabaseSync,input:unknown,secret:Uint8Array,plan:GuidePlan="basic",now=Math.floor(Date.now()/1000)){
 const review=reviewedReplySchema.parse(input),digest=createHash("sha256").update(JSON.stringify(review)).digest("hex");
 initializeGuideLimits(db);
 db.exec("BEGIN IMMEDIATE");
 try{
  const row=db.prepare("SELECT sender,state FROM support_case WHERE id=?").get(review.caseId) as {sender:string;state:string}|undefined;
  if(!row||row.state!=="open"||row.sender===getPublicKey(secret))throw new Error("Reviewed reply requires an open recipient case.");
  const messages=db.prepare("SELECT id FROM support_message WHERE case_id=? ORDER BY created_at,id").all(review.caseId) as {id:string}[];
  if(JSON.stringify(messages.map(message=>message.id))!==JSON.stringify(review.messageIds))throw new Error("Case messages changed; review the latest conversation first.");
  // Legacy replies lack reviewed message IDs: conservatively bind them to the current snapshot during migration.
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='support_reply'").get()){
   const legacy=db.prepare("SELECT * FROM support_reply").all() as {case_id:string;digest:string;recipient:string;wrapped:string;state:string}[];
   for(const old of legacy){const ids=db.prepare("SELECT id FROM support_message WHERE case_id=? ORDER BY created_at,id").all(old.case_id) as {id:string}[];const key=createHash("sha256").update(JSON.stringify(ids.map(message=>message.id))).digest("hex");db.prepare("INSERT OR IGNORE INTO support_reply_v2 VALUES (?,?,?,?,?,?,?,?)").run(`legacy:${old.case_id}`,old.case_id,key,old.digest,old.recipient,old.wrapped,old.state==="acknowledged"?"legacy":"legacy-pending",old.state);}
  }
  const messageKey=createHash("sha256").update(JSON.stringify(review.messageIds)).digest("hex"),reviewKey=createHash("sha256").update(review.caseId+messageKey).digest("hex");
  let saved=db.prepare("SELECT review_key,digest,recipient,wrapped,state,plan FROM support_reply_v2 WHERE case_id=? AND message_key=?").get(review.caseId,messageKey) as {review_key:string;digest:string;recipient:string;wrapped:string;state:string;plan:string}|undefined;
  if(saved&&(saved.digest!==digest||saved.recipient!==row.sender))throw new Error("This turn already has a different reviewed reply.");
  if(saved&&saved.state==="pending"&&saved.plan!==plan&&saved.plan!=="legacy"){if(plan==="basic")assertGuideAllowance(db,row.sender,plan,now);db.prepare("UPDATE support_reply_v2 SET plan=? WHERE review_key=?").run(plan,saved.review_key);}
  if(!saved){assertGuideAllowance(db,row.sender,plan,now);const wrapped=JSON.stringify(wrapAlert(review.reply,row.sender,secret).recipient);db.prepare("INSERT INTO support_reply_v2 VALUES (?,?,?,?,?,?,?,'pending')").run(reviewKey,review.caseId,messageKey,digest,row.sender,wrapped,plan);saved={review_key:reviewKey,digest,recipient:row.sender,wrapped,state:"pending",plan};}
  db.exec("COMMIT");return {caseId:review.caseId,reviewKey:saved.review_key,recipient:saved.recipient,wrapped:JSON.parse(saved.wrapped) as Event,acknowledged:saved.state==="acknowledged"};
 }catch(error){db.exec("ROLLBACK");throw error;}
}
