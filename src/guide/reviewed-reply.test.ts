import {describe,expect,it} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey,getPublicKey} from "nostr-tools";
import {wrapEvent,unwrapEvent} from "nostr-tools/nip59";
import {GuideSupportCases} from "./support";
import {prepareReviewedReply} from "./reviewed-reply";

describe("operator-reviewed Guide reply",()=>{
 it("binds reviewed text to an exact case and reuses the persisted event after a retry",()=>{
  const db=new DatabaseSync(":memory:"),store=new GuideSupportCases(db),guide=generateSecretKey(),sender=generateSecretKey(),now=Math.floor(Date.now()/1000);
  try{
   store.ingest(wrapEvent({kind:14,created_at:now,tags:[["p",getPublicKey(guide)]],content:"How do I add a walk?"},sender,getPublicKey(guide)),guide,now);
   const caseId=store.list()[0].id,review={caseId,messageIds:store.messages(caseId).map(message=>message.id),reply:"Open My walks."};
   const first=prepareReviewedReply(db,review,guide),retry=prepareReviewedReply(db,review,guide);
   expect(retry.wrapped.id).toBe(first.wrapped.id);expect(first.recipient).toBe(getPublicKey(sender));expect(unwrapEvent(first.wrapped,sender).content).toBe(review.reply);
   expect(()=>prepareReviewedReply(db,{...review,reply:"Different text"},guide)).toThrow("different reviewed reply");
   db.prepare("UPDATE support_reply SET state='acknowledged'").run();expect(prepareReviewedReply(db,review,guide).acknowledged).toBe(true);
   store.ingest(wrapEvent({kind:14,created_at:now+1,tags:[["p",getPublicKey(guide)]],content:"Another question"},sender,getPublicKey(guide)),guide,now+1);
   expect(()=>prepareReviewedReply(db,review,guide)).toThrow("messages changed");
   store.close(caseId,now+2);expect(()=>prepareReviewedReply(db,review,guide)).toThrow("open recipient case");
   store.prune(now+31*86400);expect(db.prepare("SELECT * FROM support_reply").all()).toEqual([]);
  }finally{db.close();}
 });
});
