import {readFileSync,lstatSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {SimplePool} from "nostr-tools";
import {assertBotKey,configSchema,selectInbox,signTransportAuth} from "../src/guide/core";
import {prepareReviewedReply} from "../src/guide/reviewed-reply";
import {readAnyComplete,publishIdempotent} from "../src/guide/transport";
import {readGuideSupportPlan} from "../src/guide/support-access";
import {acknowledgeGuideReply} from "../src/guide/support-limits";
import {reviewedReplySchema} from "../src/guide/reviewed-reply";

async function main(){
 const credentials=process.env.CREDENTIALS_DIRECTORY,state=process.env.STATE_DIRECTORY,configPath=process.env.GUIDE_CONFIG,expected=process.env.GUIDE_REVIEW_SHA256;
 if(!credentials||!state||!configPath||!expected||!/^[0-9a-f]{64}$/.test(expected))throw new Error("Reviewed reply configuration is incomplete.");
 const config=configSchema.parse(JSON.parse(readFileSync(configPath,"utf8")));if(!config.support.enabled)throw new Error("Support intake must be enabled.");
 const keyPath=join(credentials,"guide-key"),stat=lstatSync(keyPath);if(!stat.isFile()||(stat.mode&0o027)!==0||stat.size>66)throw new Error("Guide credential must be private.");
 const raw=readFileSync(keyPath,"utf8").trim();if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Invalid Guide credential.");
 const reviewPath=join(credentials,"reviewed-reply"),reviewStat=lstatSync(reviewPath);if(!reviewStat.isFile()||reviewStat.size>100_000)throw new Error("Invalid review artifact.");
 const artifact=readFileSync(reviewPath);if(createHash("sha256").update(artifact).digest("hex")!==expected)throw new Error("Review artifact hash changed.");
 const databasePath=join(state,"guide.sqlite");if(!lstatSync(databasePath).isFile())throw new Error("Existing Guide database is required.");
 const secret=Uint8Array.from(Buffer.from(raw,"hex")),db=new DatabaseSync(databasePath),pool=new SimplePool({enableReconnect:false});
 try{
  db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL");
  const bot=assertBotKey(secret,config.recipients),identity=db.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}|undefined;
  if(identity?.value!==JSON.stringify([bot,config.sourceRelay]))throw new Error("Guide state identity does not match.");
  const review=reviewedReplySchema.parse(JSON.parse(artifact.toString("utf8"))),row=db.prepare("SELECT sender FROM support_case WHERE id=? AND state='open'").get(review.caseId) as {sender:string}|undefined;
  if(!row)throw new Error("An open support case is required.");
  const plan=await readGuideSupportPlan(secret,config.proSetupStatusURL,row.sender),reply=prepareReviewedReply(db,review,secret,plan);
  if(!reply.acknowledged){const lists=await readAnyComplete(pool,config.discoveryRelays,{kinds:[10050],authors:[reply.recipient],limit:10}),relays=selectInbox(lists,reply.recipient,config.allowedInboxRelays);await publishIdempotent(pool,relays,reply.wrapped,async template=>signTransportAuth(template,secret,relays));acknowledgeGuideReply(db,reply.reviewKey);}
  console.log(JSON.stringify({caseId:reply.caseId,eventId:reply.wrapped.id,relayAcknowledged:true,alreadyAcknowledged:reply.acknowledged,readReceipt:false}));
 }finally{pool.destroy();db.close();secret.fill(0);}
}
main().catch(error=>{console.error(`Reviewed reply failed: ${error instanceof Error?error.message:"unknown error"}`);process.exitCode=1;});
