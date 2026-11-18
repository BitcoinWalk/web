import assert from "node:assert/strict";
import {readFileSync,lstatSync,existsSync,writeFileSync,mkdtempSync,chmodSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {getPublicKey} from "nostr-tools";
import {configSchema} from "../src/guide/core";
import {readGuideSupportPlan} from "../src/guide/support-access";
import {privatePilotPolicySchema} from "../src/guide/private-pilot";
import {loadGuideKnowledge,guidePromptSha256} from "../src/guide/assistant";
import {guideEvaluationSha256} from "../src/guide/evaluation";
import disabled from "../deploy/guide-private-pilot-disabled.json";

async function main(){
 assert.equal(process.getuid?.(),0,"Run the Test1 activation helper with sudo on Relays.");
 const [mode,knowledgePath]=process.argv.slice(2);
 assert((mode==="--preflight"||mode==="--activate")&&knowledgePath&&process.argv.length===4,"Use --preflight or --activate and the pinned knowledge path.");
 const policyPath="/etc/bitcoinwalk-guide/private-pilot-policy.json";
 assert(!existsSync(policyPath),"A pilot policy already exists. Do not reset or renew it without review.");
 const config=configSchema.parse(JSON.parse(readFileSync("/etc/bitcoinwalk-guide/config.json","utf8")));
 assert(config.support.enabled&&config.proSetupStatusURL==="http://127.0.0.1:3345/api/pro-setup-notifications","Production support configuration is required.");
 const knowledge=loadGuideKnowledge(knowledgePath);
 assert.equal(knowledge.sha256,disabled.knowledgeSha256);assert.equal(guidePromptSha256,disabled.promptSha256);assert.equal(guideEvaluationSha256,disabled.suiteSha256);
 const keyPath="/etc/bitcoinwalk-guide/guide-key",stat=lstatSync(keyPath);assert(stat.isFile()&&(stat.mode&0o077)===0,"Guide key must be private.");
 const raw=readFileSync(keyPath,"utf8").trim();assert(/^[0-9a-f]{64}$/.test(raw),"Invalid Guide credential.");
 assert(lstatSync("/var/lib/bitcoinwalk-guide/guide.sqlite").isFile(),"Existing Guide state is required.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex")),db=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});
 const recipient="a3677fbf62428836e06743853a6c7c4d0df4c8e13a6f048f1c393a64aa169267";
 try{
  db.exec("PRAGMA busy_timeout=5000");
  const bot=getPublicKey(secret);assert.equal(bot,"9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c");
  const identity=db.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}|undefined;
  assert.equal(identity?.value,JSON.stringify([bot,config.sourceRelay]),"Production Guide identity mismatch.");
  const owner=db.prepare("SELECT sender FROM support_case WHERE id=?").get("99c87b766bfba8ea01d932754daf9dbf052b319e845acf2c48895c86fe9e6fd8") as {sender:string}|undefined;
  assert.equal(owner?.sender,recipient,"The reviewed Test1 case identity changed.");
  const plan=await readGuideSupportPlan(secret,config.proSetupStatusURL,recipient);
  if(mode==="--preflight"){console.log(JSON.stringify({result:"BW152_TEST1_PREFLIGHT_OK",recipient,plan,sent:false,modelCalls:0}));return;}
  process.umask(0o077);
  const backup=mkdtempSync("/var/backups/bitcoinwalk-guide-private-pilot.");db.prepare("VACUUM INTO ?").run(`${backup}/guide.sqlite`);
  const startsAt=Math.floor(Date.now()/1000)+2;
  const policy=privatePilotPolicySchema.parse({...disabled,id:`bw152-test1-${startsAt}`,enabled:true,recipient,environment:"production",startsAt,expiresAt:startsAt+3600});
  writeFileSync(policyPath,JSON.stringify(policy)+"\n",{flag:"wx",mode:0o644});
  chmodSync(policyPath,0o644);
  console.log(JSON.stringify({result:"BW152_TEST1_POLICY_CREATED",recipient,plan,startsAt,expiresAt:policy.expiresAt,maxCalls:10,maxDeliveries:5,backup,sent:false,modelCalls:0}));
 }finally{db.close();secret.fill(0);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Pilot preparation failed.");process.exitCode=1;});
