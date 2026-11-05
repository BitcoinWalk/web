import {readFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {SimplePool} from "nostr-tools";
import {assertBotKey,configSchema,selectInbox,signTransportAuth} from "../src/guide/core";
import {draftGuideReply,loadGuideKnowledge,guidePromptSha256} from "../src/guide/assistant";
import {guideEvaluationSha256} from "../src/guide/evaluation";
import {privatePilotPolicySchema,runPrivatePilotCase} from "../src/guide/private-pilot";
import {readGuideSupportPlan} from "../src/guide/support-access";
import {readAnyComplete,publishIdempotent} from "../src/guide/transport";

async function main(){
 const path=process.env.GUIDE_PRIVATE_PILOT_POLICY;
 if(!path)throw new Error("Private pilot policy is required.");
 const readPolicy=()=>{
  const stat=lstatSync(path);if(!stat.isFile()||stat.uid!==0||(stat.mode&0o022)!==0||stat.size>8192)throw new Error("Private pilot policy must be a root-owned, non-writable regular file.");
  return privatePilotPolicySchema.parse(JSON.parse(readFileSync(path,"utf8")));
 };
 const policy=readPolicy();
 if(!policy.enabled){console.log(JSON.stringify({result:"BW152_PRIVATE_PILOT_DISABLED",sent:false,modelCalls:0}));return;}
 const credentials=process.env.CREDENTIALS_DIRECTORY,state=process.env.STATE_DIRECTORY,configPath=process.env.GUIDE_CONFIG,knowledgePath=process.env.GUIDE_KNOWLEDGE,caseId=process.argv[2];
 if(!credentials||!state||!configPath||!knowledgePath||process.argv.length!==3||!/^[0-9a-f]{64}$/.test(caseId??""))throw new Error("Use the isolated one-shot unit with one exact case ID.");
 const config=configSchema.parse(JSON.parse(readFileSync(configPath,"utf8")));
 const port=policy.environment==="production"?3345:3338;
 if(!config.support.enabled||config.proSetupStatusURL!==`http://127.0.0.1:${port}/api/pro-setup-notifications`)throw new Error("Private pilot environment does not match Guide configuration.");
 const knowledge=loadGuideKnowledge(knowledgePath);
 if(knowledge.sha256!==policy.knowledgeSha256||guidePromptSha256!==policy.promptSha256||guideEvaluationSha256!==policy.suiteSha256)throw new Error("Private pilot candidate changed; evaluation is required.");
 const readCredential=(name:string,max:number)=>{
  const path=join(credentials,name),stat=lstatSync(path);
  if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>max)throw new Error("Private pilot credential permissions are unsafe.");
  const value=readFileSync(path,"utf8").trim();if(!value)throw new Error("Private pilot credential is empty.");return value;
 };
 const raw=readCredential("guide-key",66);if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Invalid Guide credential.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex"));
 const databasePath=join(state,"guide.sqlite");if(!lstatSync(databasePath).isFile())throw new Error("Existing Guide state is required.");
 const db=new DatabaseSync(databasePath),pool=new SimplePool({enableReconnect:false});
 try{
  db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL");
  const bot=assertBotKey(secret,config.recipients),identity=db.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}|undefined;
  if(identity?.value!==JSON.stringify([bot,config.sourceRelay]))throw new Error("Guide state identity does not match.");
  const result=await runPrivatePilotCase(db,caseId!,secret,{
   readPolicy,now:()=>Math.floor(Date.now()/1000),
   plan:recipient=>readGuideSupportPlan(secret,config.proSetupStatusURL,recipient),
   draft:message=>draftGuideReply([message],knowledge,{apiKey:readCredential("openai-key",512),model:policy.model}),
   discover:async recipient=>selectInbox(await readAnyComplete(pool,config.discoveryRelays,{kinds:[10050],authors:[recipient],limit:10}),recipient,config.allowedInboxRelays),
   publish:async(event,relays)=>{await publishIdempotent(pool,relays,event,async template=>signTransportAuth(template,secret,relays));},
  });
  console.log(JSON.stringify({result:"BW152_PRIVATE_PILOT_RESULT",...result}));
 }finally{pool.destroy();db.close();secret.fill(0);}
}
main().catch(()=>{console.error("Private pilot stopped; review admission, quota, exact-message state and service diagnostics. No automatic retry was attempted.");process.exitCode=1;});
