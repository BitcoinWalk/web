import {lstatSync,mkdirSync,readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {userInfo} from "node:os";
import {backup,DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {queryAuthorizations,queryDirectoryRecords} from "../src/nostr/city-records";
import {createAdminProPromotionTemplate,installAdminProPromotion} from "../src/payments/admin-pro-promotion";

const targets={
 staging:{database:"/var/lib/bitcoinwalk-app-staging/payments.sqlite",relays:["wss://relay-staging.bitcoinwalk.org/"]},
 production:{database:"/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite",relays:["wss://relay.bitcoinwalk.org/"]},
} as const;
function target(value:string){if(value!=="staging"&&value!=="production")throw new Error("Target must be staging or production.");return targets[value];}
async function evidence(relays:readonly string[]){const urls=[...relays],[snapshot,authorizations]=await Promise.all([queryDirectoryRecords(urls),queryAuthorizations(urls)]);return {...snapshot,authorizations};}
async function main(){
 if(userInfo().username!=="bitcoinwalk"||process.getuid?.()===0)throw new Error("Run as the non-root bitcoinwalk user.");
 const mode=process.argv[2];
 if(mode==="--template"){
  const selected=target(process.argv[3]??""),cityId=process.argv[4],reason=process.argv.slice(5).join(" ");if(!cityId||!reason)throw new Error("Use --template <staging|production> <city-id> <reason>.");
  console.log(JSON.stringify(createAdminProPromotionTemplate(await evidence(selected.relays),{cityId,reason,nonce:randomUUID()}),null,2));return;
 }
 if(!["--verify-only","--apply"].includes(mode))throw new Error("Use --template, --verify-only or --apply.");
 const selected=target(process.argv[3]??""),database=selected.database,eventPath=process.argv[4];
 if(!eventPath)throw new Error("Use --verify-only or --apply with <staging|production> <signed-event-file>.");
 for(const path of [database,eventPath]){const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("Database and signed event must be exact regular files.");if(path===eventPath&&stat.size>65_536)throw new Error("Signed event file is too large.");}
 const event=JSON.parse(readFileSync(eventPath,"utf8")) as Event,db=new DatabaseSync(database,{readOnly:mode==="--verify-only"});
 try{
  const current=await evidence(selected.relays),checked=installAdminProPromotion(db,event,current,false);
  if(mode==="--verify-only"){console.log(`ADMIN_PRO_PROMOTION_VERIFY_OK city=${checked.cityId} bundle=${checked.bundle} organizer_bps=${checked.organizerBasisPoints} retained_bps=${checked.retainedBasisPoints} capabilities=${checked.capabilities.join(",")} already_present=${!checked.created}`);return;}
  const backupDirectory="/home/bitcoinwalk/backups";mkdirSync(backupDirectory,{recursive:true,mode:0o700});
  const backupPath=`${backupDirectory}/admin-pro-promotion-${checked.cityId}-${Date.now()}.sqlite`;await backup(db,backupPath);db.exec("BEGIN IMMEDIATE");
  try{const result=installAdminProPromotion(db,event,current,true);db.exec("COMMIT");console.log(`ADMIN_PRO_PROMOTION_APPLY_OK city=${result.cityId} bundle=${result.bundle} organizer_bps=${result.organizerBasisPoints} retained_bps=${result.retainedBasisPoints} created=${result.created} backup=${backupPath}`);}catch(error){db.exec("ROLLBACK");throw error;}
 }finally{db.close();}
}
process.umask(0o077);
main().catch(error=>{console.error(`Administrative Pro promotion refused: ${error instanceof Error?error.message:"invalid operation"}`);process.exitCode=1;});
