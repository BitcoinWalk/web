import assert from "node:assert/strict";
import {readFileSync,lstatSync} from "node:fs";
import {basename,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {generateSecretKey,getPublicKey} from "nostr-tools";
import {GuideSupportCases} from "../src/guide/support";
import {prepareReviewedReply} from "../src/guide/reviewed-reply";
import {acknowledgeGuideReply,assertGuideAllowance,GUIDE_BREAK_SECONDS} from "../src/guide/support-limits";
import {readGuideSupportPlan} from "../src/guide/support-access";

async function main(){
 const state=process.env.STATE_DIRECTORY,credentials=process.env.CREDENTIALS_DIRECTORY,proRecipient=process.env.GUIDE_STAGING_PRO_PUBKEY;
 assert(state&&basename(state)==="bitcoinwalk-guide-policy-staging","Use only the isolated staging state directory.");
 assert(credentials&&proRecipient&&/^[0-9a-f]{64}$/.test(proRecipient),"Guide credential and a staging Pro account are required.");
 const keyPath=join(credentials,"guide-key"),stat=lstatSync(keyPath);assert(stat.isFile()&&(stat.mode&0o027)===0&&stat.size<=66,"Invalid Guide credential permissions.");
 const raw=readFileSync(keyPath,"utf8").trim();assert(/^[0-9a-f]{64}$/.test(raw),"Invalid Guide key.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex"));
 assert.notEqual(getPublicKey(secret),"9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c","Use a separate staging test identity.");
 const db=new DatabaseSync(join(state,"guide-policy.sqlite")),store=new GuideSupportCases(db),now=Math.floor(Date.now()/1000),basicRecipient=getPublicKey(generateSecretKey());
 try{
  const url="http://127.0.0.1:3338/api/pro-setup-notifications",basicPlan=await readGuideSupportPlan(secret,url,basicRecipient),proPlan=await readGuideSupportPlan(secret,url,proRecipient);
  assert.equal(basicPlan,"basic");assert.equal(proPlan,"pro","The selected staging account does not currently have verified Pro access.");
  const seed=(recipient:string)=>{const id=createHash("sha256").update(randomUUID()).digest("hex");db.prepare("INSERT INTO support_case(id,sender,state,opened_at,updated_at) VALUES (?,?,'open',?,?)").run(id,recipient,now,now);return id;};
  const basicCase=seed(basicRecipient),proCase=seed(proRecipient);
  const turn=(caseId:string,recipient:string,index:number)=>{const id=createHash("sha256").update(caseId+index).digest("hex");db.prepare("INSERT INTO support_message VALUES (?,?,?,?,?,?,?)").run(id,caseId,id,recipient,"Synthetic BitcoinWalk staging question",now+index,now+index);return {caseId,messageIds:store.messages(caseId).map(row=>row.id),reply:"Synthetic reviewed staging answer. No message will be sent."};};
  let finalAck=now;
  for(let i=0;i<3;i++){const review=turn(basicCase,basicRecipient,i),reply=prepareReviewedReply(db,review,secret,basicPlan,now+i);assert.equal(prepareReviewedReply(db,review,secret,basicPlan,now+i).wrapped.id,reply.wrapped.id);acknowledgeGuideReply(db,reply.reviewKey,now+i);acknowledgeGuideReply(db,reply.reviewKey,now+i);finalAck=now+i;}
  const fourth=turn(basicCase,basicRecipient,3);
  assert.throws(()=>prepareReviewedReply(db,fourth,secret,basicPlan,finalAck+1),/resume at/);
  assert.throws(()=>assertGuideAllowance(db,basicRecipient,basicPlan,finalAck+GUIDE_BREAK_SECONDS-1),/resume at/);
  assert.doesNotThrow(()=>assertGuideAllowance(db,basicRecipient,basicPlan,finalAck+GUIDE_BREAK_SECONDS));
  assert.doesNotThrow(()=>prepareReviewedReply(db,fourth,secret,basicPlan,finalAck+GUIDE_BREAK_SECONDS));
  for(let i=0;i<5;i++){const reply=prepareReviewedReply(db,turn(proCase,proRecipient,i),secret,proPlan,now+i);acknowledgeGuideReply(db,reply.reviewKey,now+i);}
  console.log(JSON.stringify({result:"BW152_STAGING_POLICY_OK",basicReplies:3,fourthBasicBlocked:true,cooldownBoundarySeconds:GUIDE_BREAK_SECONDS,resetVerified:true,proReplies:5,retriesCountOnce:true,verifiedStagingPlans:true,syntheticConversations:true,simulatedClock:true,messagesSent:0,modelCalls:0}));
 }finally{db.close();secret.fill(0);}
}
main().catch(error=>{console.error(`Staging policy check failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
