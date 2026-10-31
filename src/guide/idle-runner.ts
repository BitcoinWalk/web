import {readFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {SimplePool,finalizeEvent,type Event} from "nostr-tools";
import {z} from "zod";
import {configSchema,assertBotKey,selectInbox,signTransportAuth} from "./core";
import {mediaRequestTemplate} from "../domain/media-request";
import {idleSnapshotSchema} from "./idle-contract";
import {IdleReminders} from "./idle-reminders";
import {Outbox} from "./outbox";
import {readAnyComplete,publishIdempotent} from "./transport";

async function main(){
 process.umask(0o077);
 const configPath=process.env.GUIDE_CONFIG,state=process.env.STATE_DIRECTORY,credentials=process.env.CREDENTIALS_DIRECTORY;
 if(!configPath||!state||!credentials)throw Error("Dedicated Guide configuration and credential directories required.");
 const config=configSchema.extend({idleEnabled:z.boolean().default(false),idleRecipients:z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(100).default([])}).parse(JSON.parse(readFileSync(configPath,"utf8")));
 const dry=process.argv.includes("--dry-run");
 if(!dry&&!process.argv.includes("--once"))throw Error("Choose --dry-run or --once.");
 if(!dry&&!config.idleEnabled)throw Error("Idle reminders are disabled.");
 const port=new URL(config.adminURL).hostname==="bitcoinwalk.org"?3345:3338,url=`http://127.0.0.1:${port}/api/guide-reminders`;
 const keyPath=join(credentials,"guide-key"),stat=lstatSync(keyPath);
 if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>66)throw Error("Unsafe Guide credential.");
 const raw=readFileSync(keyPath,"utf8").trim();if(!/^[0-9a-f]{64}$/.test(raw))throw Error("Invalid Guide credential.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex")),pool=new SimplePool({enableReconnect:false});let box:Outbox|undefined,engine:IdleReminders|undefined;
 const clock=()=>Math.floor(Date.now()/1000);
 async function snapshot(){
  try{
  const event=finalizeEvent(mediaRequestTemplate({action:"list-idle-reminders"}),secret);
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error("Snapshot unavailable.");return idleSnapshotSchema.parse(await response.json());
  }catch(error){engine?.unavailable();throw error;}
 }
 try{
  const bot=assertBotKey(secret,config.idleRecipients);
  if(!dry){box=new Outbox(join(state,"guide-idle.sqlite"));box.bind(bot,`${config.sourceRelay}|${config.adminURL}`);engine=new IdleReminders(box);}
  const initial=await snapshot();
  if(dry){console.log(JSON.stringify({readOnly:true,paused:initial.paused,cities:initial.cities.length,eligible:initial.cities.filter(city=>city.empty&&city.allowed&&config.idleRecipients.includes(city.recipient)).length,suppressed:initial.cities.filter(city=>!city.allowed).length}));return;}
  // Separate from the lifecycle worker so it cannot deliver an idle batch without rechecking it.
  const outbox=box!,reminders=engine!;
  const queued=reminders.queue(initial,secret,config.adminURL,clock(),config.idleRecipients);
  let acknowledged=0,deferred=0;
  for(const row of outbox.due(clock())){
   if(row.purpose!=="idle-reminder")throw Error("Unexpected outbox purpose.");
   if(!config.idleRecipients.includes(row.recipient))continue;
   try{
    const lists=await readAnyComplete(pool,config.discoveryRelays,{kinds:[10050],authors:[row.recipient],limit:10});
    const relays=selectInbox(lists,row.recipient,config.allowedInboxRelays);
    const fresh=reminders.reconcile(await snapshot(),clock());
    if(!reminders.current(row,fresh,clock()))continue;
    await publishIdempotent(pool,relays,JSON.parse(row.wrapped) as Event,async template=>signTransportAuth(template,secret,relays));
    reminders.acknowledge(row,clock());acknowledged++;
   }catch{outbox.retry(row,clock());deferred++;}
  }
  console.log(JSON.stringify({queued,acknowledged,deferred,readReceipt:false}));
 }catch(error){engine?.unavailable();throw error;}
 finally{box?.close();pool.destroy();secret.fill(0);}
}
main().catch(()=>{console.error("Idle reminder scan unavailable. No inactivity inferred; inspect configuration and source availability. No private content logged.");process.exitCode=1;});
