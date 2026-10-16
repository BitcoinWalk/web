import {backup,DatabaseSync} from "node:sqlite";
import {getEventHash,verifyEvent,type Event} from "nostr-tools";

const CITY="83f15504-9fca-4d59-a0f6-616a559510df",OWNER="74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0",INVOICE="752838d4-a5d0-4449-8f6f-3ecc4edb6505";
const [sourcePath,targetPath,mode]=process.argv.slice(2);
if(!sourcePath||!targetPath||sourcePath===targetPath||![/^\/home\/bitcoinwalk\/.local\/state\/bitcoinwalk-production\/payments\.sqlite$/, /^\/var\/lib\/bitcoinwalk-app-staging\/payments\.sqlite$/].every((rule,index)=>rule.test(index?targetPath:sourcePath))){console.error("Exact production source and staging target paths are required.");process.exit(1);}
const source=new DatabaseSync(sourcePath,{readOnly:true}),target=new DatabaseSync(targetPath);
const tables=["payment_invoice","paid_city_entitlement","pro_setup_task","payout_destination_version"];
for(const db of [source,target])for(const name of tables)if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))throw new Error(`Missing required ${name} table.`);
const invoiceColumns="id,cityId,owner,cityName,revisionId,invoice,paymentHash,amountMsat,createdAt,expiresAt,status,settledAt,checkedAt,source";
const entitlementColumns="cityId,owner,paymentHash,invoiceId,paidAt";
const setupColumns="cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,registrationVersion,payoutVersion,brandPubkey,brandVersion,backupAcknowledgedAt,artworkRevisionId,artworkAvatar,artworkBanner,artworkVersion,state,createdAt,updatedAt";
const destinationColumns="city_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,authority,owner_event_id,owner_event,confirmed_at";
const invoice=source.prepare(`SELECT ${invoiceColumns} FROM payment_invoice WHERE id=? AND cityId=?`).get(INVOICE,CITY) as Record<string,unknown>|undefined;
const entitlement=source.prepare(`SELECT ${entitlementColumns} FROM paid_city_entitlement WHERE cityId=?`).get(CITY) as Record<string,unknown>|undefined;
const setup=source.prepare(`SELECT ${setupColumns} FROM pro_setup_task WHERE cityId=?`).get(CITY) as Record<string,unknown>|undefined;
const destination=setup?.payoutVersion?source.prepare(`SELECT ${destinationColumns} FROM payout_destination_version WHERE city_id=? AND version=?`).get(CITY,Number(setup.payoutVersion)) as Record<string,unknown>|undefined:undefined;
if(!invoice||!entitlement||!setup||!destination||invoice.id!==INVOICE||invoice.owner!==OWNER||invoice.status!=="paid"||invoice.amountMsat!==21_000_000||entitlement.owner!==OWNER||entitlement.invoiceId!==INVOICE||
 setup.currentOwnerPubkey!==OWNER||!Number.isSafeInteger(setup.payoutVersion)||Number(setup.payoutVersion)<1||destination.owner_pubkey!==OWNER)throw new Error("Madeira production Pro evidence is incomplete or changed.");
let event:Event,command:{action?:unknown;cityId?:unknown;destination?:unknown};try{event=JSON.parse(String(destination.owner_event));command=JSON.parse(event.content);}catch{throw new Error("Madeira payout authority is invalid.");}
if(event.id!==destination.owner_event_id||event.pubkey!==OWNER||event.kind!==27235||getEventHash(event)!==event.id||!verifyEvent(event)||command.action!=="save-payout"||command.cityId!==CITY||typeof command.destination!=="string"||
 command.destination.trim().toLowerCase()!==destination.normalized)throw new Error("Madeira payout authority signature does not match the active destination.");
const specifications=[
 {name:"payment invoice",sql:`SELECT ${invoiceColumns} FROM payment_invoice WHERE id=? OR cityId=? OR paymentHash=?`,args:[INVOICE,CITY,invoice.paymentHash],insert:`INSERT INTO payment_invoice(${invoiceColumns}) VALUES(${Array(14).fill("?").join(",")})`,row:invoice},
 {name:"entitlement",sql:`SELECT ${entitlementColumns} FROM paid_city_entitlement WHERE cityId=? OR invoiceId=? OR paymentHash=?`,args:[CITY,INVOICE,invoice.paymentHash],insert:`INSERT INTO paid_city_entitlement(${entitlementColumns}) VALUES(?,?,?,?,?)`,row:entitlement},
 {name:"setup",sql:`SELECT ${setupColumns} FROM pro_setup_task WHERE cityId=? OR entitlementId=?`,args:[CITY,INVOICE],insert:`INSERT INTO pro_setup_task(${setupColumns}) VALUES(${Array(16).fill("?").join(",")})`,row:setup},
 {name:"destination",sql:`SELECT ${destinationColumns} FROM payout_destination_version WHERE city_id=? OR owner_event_id=?`,args:[CITY,destination.owner_event_id],insert:`INSERT INTO payout_destination_version(${destinationColumns}) VALUES(${Array(12).fill("?").join(",")})`,row:destination},
];
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right),existing=specifications.map(item=>target.prepare(item.sql).all(...item.args as never[]) as Record<string,unknown>[]),some=existing.some(rows=>rows.length===1),every=existing.every(rows=>rows.length===1);
if(existing.some(rows=>rows.length>1)||existing.some((rows,index)=>rows.length===1&&!same(rows[0],specifications[index].row))||some&&!every)throw new Error("Staging contains partial or conflicting Madeira Pro evidence.");
if(existing.every(rows=>rows.length)){console.log("MADEIRA_SPONSOR_ELIGIBILITY_OK created=false");source.close();target.close();process.exit(0);}
if(mode!=="--apply"){console.log("MADEIRA_SPONSOR_ELIGIBILITY_READY created=true");source.close();target.close();process.exit(0);}
const backupPath=`/home/bitcoinwalk/backups/madeira-sponsor-eligibility-${Date.now()}.sqlite`;await backup(target,backupPath);target.exec("BEGIN IMMEDIATE");
try{for(const item of specifications)target.prepare(item.insert).run(...Object.values(item.row) as never[]);target.exec("COMMIT");}catch(error){target.exec("ROLLBACK");throw error;}
console.log(`MADEIRA_SPONSOR_ELIGIBILITY_OK created=true backup=${backupPath}`);source.close();target.close();
