import {readFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {SimplePool} from "nostr-tools";
import {configSchema,assertBotKey,selectInbox,signTransportAuth} from "../src/guide/core";
import {readGuideProSetupTasks} from "../src/guide/pro-setup";
import {readAnyComplete,publishIdempotent} from "../src/guide/transport";
import {hannoverMessage,hannoverRecipient,prepareHannoverDelivery} from "../src/guide/hannover-followup";

async function main(){
 process.umask(0o077);
 if(process.argv.length!==3||!["--preview","--send"].includes(process.argv[2]))throw new Error("Use --preview or --send. Recipient and message cannot be overridden.");
 const send=process.argv[2]==="--send",credentials=process.env.CREDENTIALS_DIRECTORY,state=process.env.STATE_DIRECTORY;
 if(!credentials||!state)throw new Error("Run through the supplied isolated systemd command.");
 const config=configSchema.parse(JSON.parse(readFileSync("/etc/bitcoinwalk-guide/config.json","utf8")));
 if(config.proSetupStatusURL!=="http://127.0.0.1:3345/api/pro-setup-notifications")throw new Error("Guide must use the production setup endpoint.");
 const keyPath=join(credentials,"guide-key"),stat=lstatSync(keyPath);
 if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>66)throw new Error("Invalid protected credential file.");
 const raw=readFileSync(keyPath,"utf8").trim();if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Invalid Guide credential.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex")),pool=new SimplePool();let db:DatabaseSync|undefined;
 try{
  const bot=assertBotKey(secret,config.recipients);
  const tasks=await readGuideProSetupTasks(secret,config.proSetupStatusURL),recipient=hannoverRecipient(tasks);
  if(recipient===bot)throw new Error("Cannot message Guide itself.");
  const lists=await readAnyComplete(pool,config.discoveryRelays,{kinds:[10050],authors:[recipient],limit:20});
  const relays=selectInbox(lists,recipient,config.allowedInboxRelays);
  console.log(JSON.stringify({mode:send?"send":"preview",guide:bot,recipient,relays,message:hannoverMessage},null,2));
  if(!send){console.log("PREVIEW ONLY: no message queued or published.");return;}
  db=new DatabaseSync(join(state,"delivery.sqlite"));db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
  const delivery=prepareHannoverDelivery(db,recipient,secret);
  if(delivery.acknowledged){console.log(JSON.stringify({status:"already-acknowledged",eventId:delivery.event.id}));return;}
  const result=await publishIdempotent(pool,relays,delivery.event,async template=>signTransportAuth(template,secret,relays));
  db.prepare("UPDATE delivery SET acknowledged=1 WHERE id=1").run();
  console.log(JSON.stringify({status:result,eventId:delivery.event.id,recipient,note:"Relay acceptance is not a read receipt. Re-running reuses the same encrypted message."}));
 }finally{db?.close();secret.fill(0);pool.destroy();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Delivery failed.");process.exitCode=1;});
