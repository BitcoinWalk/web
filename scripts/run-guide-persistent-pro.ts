import {readFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {setTimeout as delay} from "node:timers/promises";
import {SimplePool} from "nostr-tools";
import {assertBotKey,configSchema,selectInbox,signTransportAuth} from "../src/guide/core";
import {draftGuideReply,loadGuideKnowledge,guidePromptSha256} from "../src/guide/assistant";
import {guideEvaluationSha256} from "../src/guide/evaluation";
import {persistentProPolicySchema,persistentProTick,recoverPersistentPro} from "../src/guide/persistent-pro";
import {readGuideSupportPlan} from "../src/guide/support-access";
import {readAnyComplete,publishIdempotent} from "../src/guide/transport";
import {GuideProcessingReactions} from "../src/guide/processing-reaction";

async function main(){
 const path=process.env.GUIDE_PERSISTENT_PRO_POLICY;
 if(!path)throw new Error("Persistent Pro Guide policy is required.");
 const readPolicy=()=>{
  const stat=lstatSync(path);if(!stat.isFile()||stat.uid!==0||(stat.mode&0o022)!==0||stat.size>8192)throw new Error("Persistent Pro Guide policy must be a root-owned, non-writable regular file.");
  return persistentProPolicySchema.parse(JSON.parse(readFileSync(path,"utf8")));
 };
 const policy=readPolicy();
 if(!policy.enabled){console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_DISABLED",sent:false,modelCalls:0}));return;}
 const credentials=process.env.CREDENTIALS_DIRECTORY,state=process.env.STATE_DIRECTORY,configPath=process.env.GUIDE_CONFIG,knowledgePath=process.env.GUIDE_KNOWLEDGE,watch=process.argv[2]==="--watch";
 if(!credentials||!state||!configPath||!knowledgePath||process.argv.length!==3||!watch)throw new Error("Use --watch in the isolated persistent Pro unit.");
 const config=configSchema.parse(JSON.parse(readFileSync(configPath,"utf8")));
 const port=policy.environment==="production"?3345:3338;
 if(!config.support.enabled||config.proSetupStatusURL!==`http://127.0.0.1:${port}/api/pro-setup-notifications`)throw new Error("Persistent Pro Guide environment does not match Guide configuration.");
 const knowledge=loadGuideKnowledge(knowledgePath);
 if(knowledge.sha256!==policy.knowledgeSha256||guidePromptSha256!==policy.promptSha256||guideEvaluationSha256!==policy.suiteSha256)throw new Error("Persistent Pro Guide candidate changed; evaluation is required.");
 const readCredential=(name:string,max:number)=>{
  const path=join(credentials,name),stat=lstatSync(path);
  if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>max)throw new Error("Persistent Pro Guide credential permissions are unsafe.");
  const value=readFileSync(path,"utf8").trim();if(!value)throw new Error("Persistent Pro Guide credential is empty.");return value;
 };
 const raw=readCredential("guide-key",66);if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Invalid Guide credential.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex"));
 const databasePath=join(state,"guide.sqlite");if(!lstatSync(databasePath).isFile())throw new Error("Existing Guide state is required.");
 const db=new DatabaseSync(databasePath),pool=new SimplePool({enableReconnect:false});
 try{
  db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL");
  const bot=assertBotKey(secret,config.recipients),identity=db.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}|undefined;
  if(identity?.value!==JSON.stringify([bot,config.sourceRelay]))throw new Error("Guide state identity does not match.");
  const stop=new AbortController();
  if(watch){process.once("SIGTERM",()=>stop.abort());process.once("SIGINT",()=>stop.abort());}
  const dependencies={
   processingReactions:true,
   readPolicy:()=>({...readPolicy(),...(stop.signal.aborted?{enabled:false}:{})}),now:()=>Math.floor(Date.now()/1000),
   plan:(recipient:string)=>readGuideSupportPlan(secret,config.proSetupStatusURL,recipient),
   draft:(message:import("../src/guide/support").SupportMessage)=>draftGuideReply([message],knowledge,{apiKey:readCredential("openai-key",512),model:policy.model}),
   discover:async(recipient:string)=>selectInbox(await readAnyComplete(pool,config.discoveryRelays,{kinds:[10050],authors:[recipient],limit:10}),recipient,config.allowedInboxRelays),
   publish:async(event:import("nostr-tools").Event,relays:string[])=>{await publishIdempotent(pool,relays,event,async template=>signTransportAuth(template,secret,relays));},
  };
  recoverPersistentPro(db);
  const reactions=new GuideProcessingReactions(db,secret,dependencies),identityPolicy=JSON.stringify({...policy,enabled:false});
  let previous="";
  console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_WATCHING",recipient:policy.recipient,maxCallsPerUtcDay:10,maxRepliesPerUtcDay:5}));
  while(!stop.signal.aborted){
   const current=readPolicy();if(!current.enabled)break;
   if(JSON.stringify({...current,enabled:false})!==identityPolicy)throw new Error("Persistent policy changed; review before restart.");
   let outcome:unknown;
   try{outcome=await persistentProTick(db,secret,dependencies);}catch{outcome={state:"held-or-unavailable",sent:false};}
   const line=JSON.stringify(outcome);
   if(line!==previous){console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_TICK",outcome}));previous=line;}
   try{await reactions.retryCleanup(policy.recipient);}catch{console.warn("Guide processing cleanup remains pending.");}
   try{await delay(10000,undefined,{signal:stop.signal});}catch{break;}
  }
  console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_STOPPED"}));
 }finally{pool.destroy();db.close();secret.fill(0);}
}
main().catch(()=>{console.error("Persistent Pro Guide stopped; review admission, quota, exact-message state and service diagnostics. No automatic retry was attempted.");process.exitCode=1;});
