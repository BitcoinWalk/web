import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey,getPublicKey} from "nostr-tools";
import {wrapEvent} from "nostr-tools/nip59";
import {GuideSupportCases} from "../src/guide/support";
import {privatePilotPolicySchema,runPrivatePilotCase} from "../src/guide/private-pilot";
import {guideEvaluationCases} from "../src/guide/evaluation";
import disabled from "../deploy/guide-private-pilot-disabled.json";

async function main(){
 globalThis.fetch=async()=>{throw new Error("Network forbidden in synthetic pilot check.");};
 for(const plan of ["basic","pro"] as const){
  const db=new DatabaseSync(":memory:"),store=new GuideSupportCases(db),guide=generateSecretKey(),sender=generateSecretKey();let now=Math.floor(Date.now()/1000),drafts=0,failRelay=true;
  const events:string[]=[],policy=privatePilotPolicySchema.parse({...disabled,id:`synthetic-${plan}`,enabled:true,recipient:getPublicKey(sender),startsAt:now,expiresAt:now+3600});
  const question=guideEvaluationCases.find(test=>test.id==="bitcoin-education")!.content;
  const add=()=>{now++;store.ingest(wrapEvent({kind:14,created_at:now,tags:[["p",getPublicKey(guide)]],content:question},sender,getPublicKey(guide)),guide,now);};
  add();const caseId=store.list()[0].id;
  const run=()=>runPrivatePilotCase(db,caseId,guide,{
   readPolicy:()=>policy,now:()=>now,plan:async()=>plan,
   draft:async()=>{drafts++;return {draft:"BitcoinWalk teaches sound-money principles.",citations:["https://docs.bitcoinwalk.org/chat/walkie-talkie-and-guide/"],escalate:false,reason:"Synthetic public FAQ."};},
   discover:async()=>["wss://synthetic.invalid/"],
   publish:async event=>{events.push(event.id);if(failRelay){failRelay=false;throw new Error("Synthetic relay outage");}},
  });
  try{
   policy.enabled=false;await assert.rejects(run,/disabled/);assert.equal(drafts,0);
   policy.enabled=true;await assert.rejects(run,/Synthetic relay outage/);await run();
   assert.equal(drafts,1);assert.equal(events[0],events[1]);
   const replies=plan==="basic"?3:5;
   for(let i=1;i<replies;i++){add();await run();}
   add();await assert.rejects(run);assert.equal(drafts,replies);
  }finally{db.close();guide.fill(0);sender.fill(0);}
 }
 console.log(JSON.stringify({result:"BW152_PRIVATE_PILOT_SYNTHETIC_OK",basicReplies:3,proReplies:5,exactRetry:true,disabledVerified:true,providerCalls:0,messagesPublished:0,productionChanged:false}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Synthetic check failed.");process.exitCode=1;});
