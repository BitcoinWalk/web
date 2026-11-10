import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey} from "nostr-tools";
import {GuideSupportCases} from "../src/guide/support";
import {guidePromptSha256,loadGuideKnowledge} from "../src/guide/assistant";
import {guideEvaluationCases,guideEvaluationSha256} from "../src/guide/evaluation";
import {persistentProPolicySchema,persistentProTick,recoverPersistentPro,GUIDE_SECOND_PRO_RECIPIENT} from "../src/guide/persistent-pro";
import disabled from "../deploy/guide/persistent-pro-disabled.json";

async function main(){
 globalThis.fetch=async()=>{throw new Error("Network forbidden in persistent Guide synthetic check.");};
 const db=new DatabaseSync(":memory:"),secret=generateSecretKey();let now=1794225600,sequence=0,calls=0,caseId="a".repeat(64);
 const policy=persistentProPolicySchema.parse({...disabled,enabled:true,startsAt:now});
 assert.equal(policy.promptSha256,guidePromptSha256);assert.equal(policy.suiteSha256,guideEvaluationSha256);
 assert.equal(loadGuideKnowledge(process.argv[2]).sha256,policy.knowledgeSha256);
 new GuideSupportCases(db);
 const question=guideEvaluationCases.find(test=>test.id==="bitcoin-education")!.content;
 const add=()=>{
  now++;const id=(++sequence).toString(16).padStart(64,"0");
  db.prepare("INSERT OR IGNORE INTO support_case(id,sender,state,opened_at,updated_at) VALUES (?,?,'open',?,?)").run(caseId,policy.recipient,now,now);
  db.prepare("INSERT INTO support_message VALUES (?,?,?,?,?,?,?)").run(id,caseId,id,policy.recipient,question,now,now);db.prepare("UPDATE support_case SET updated_at=? WHERE id=?").run(now,caseId);
 };
 const deps={readPolicy:()=>policy,now:()=>now,plan:async()=>"pro" as const,discover:async()=>["wss://synthetic.invalid/"],publish:async()=>{},draft:async()=>{calls++;return {draft:"BitcoinWalk teaches sound-money principles.",citations:["https://docs.bitcoinwalk.org/chat/walkie-talkie-and-guide/"],escalate:false,reason:"Supported public FAQ."};}};
 try{
  add();policy.enabled=false;assert.equal((await persistentProTick(db,secret,deps)).state,"disabled");assert.equal(calls,0);policy.enabled=true;
  for(let i=0;i<5;i++){if(i)add();assert.equal((await persistentProTick(db,secret,deps)).state,"sent");recoverPersistentPro(db);}
  add();assert.equal((await persistentProTick(db,secret,deps)).state,"daily-limit");assert.equal(calls,5);
  now+=86400;assert.equal((await persistentProTick(db,secret,deps)).state,"idle");add();assert.equal((await persistentProTick(db,secret,deps)).state,"sent");assert.equal(calls,6);
  policy.recipient=GUIDE_SECOND_PRO_RECIPIENT;policy.startsAt=now;caseId="b".repeat(64);
  for(let i=0;i<5;i++){add();assert.equal((await persistentProTick(db,secret,deps)).state,"sent");recoverPersistentPro(db);}
  add();assert.equal((await persistentProTick(db,secret,deps)).state,"daily-limit");assert.equal(calls,11);
  assert.throws(()=>persistentProPolicySchema.parse({...policy,recipient:"b".repeat(64)}));
  console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_SYNTHETIC_OK",accounts:2,independentAccountBudgets:true,dailyReplies:5,dailyModelAttempts:10,restartBudgetPreserved:true,utcRollover:true,disabledVerified:true,providerCalls:0,messagesPublished:0,productionChanged:false}));
 }finally{db.close();secret.fill(0);}
}
main().catch(()=>{console.error("Persistent Guide synthetic check failed; no model call or message send occurred.");process.exitCode=1;});
