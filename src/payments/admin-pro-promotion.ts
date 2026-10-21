import type {DatabaseSync} from "node:sqlite";
import {verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {z} from "zod";
import {cityOwnerPubkey} from "../domain/city";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import type {ApprovalRecord,AuthorizationRecord,CityRevision} from "../nostr/city-records";
import {latestCityGrants} from "../nostr/editor-management";
import {managedCities} from "../nostr/moderation";

export const ADMIN_PRO_PROMOTION_CONTRACT="bitcoinwalk-admin-pro-promotion-v1";
export const ADMIN_PRO_BUNDLE="bitcoinwalk-lifetime-pro-v1";
export const ADMIN_PRO_CAPABILITIES=["branded-city-profile","verified-nip05","lnurl-pay-and-nip57","organizer-payout","city-logo-and-share-artwork","dedicated-city-relay-and-armada","overview-and-guide-onboarding"] as const;
const schema=z.object({contract:z.literal(ADMIN_PRO_PROMOTION_CONTRACT),action:z.literal("promote-basic-city-to-pro"),cityId:z.string().uuid(),cityName:z.string().min(1).max(100),
 ownerPubkey:z.string().regex(/^[0-9a-f]{64}$/),revisionId:z.string().regex(/^[0-9a-f]{64}$/),approvalEventId:z.string().regex(/^[0-9a-f]{64}$/),authorityEventId:z.string().regex(/^[0-9a-f]{64}$/),
 bundle:z.literal(ADMIN_PRO_BUNDLE),capabilities:z.tuple([z.literal(ADMIN_PRO_CAPABILITIES[0]),z.literal(ADMIN_PRO_CAPABILITIES[1]),z.literal(ADMIN_PRO_CAPABILITIES[2]),z.literal(ADMIN_PRO_CAPABILITIES[3]),z.literal(ADMIN_PRO_CAPABILITIES[4]),z.literal(ADMIN_PRO_CAPABILITIES[5]),z.literal(ADMIN_PRO_CAPABILITIES[6])]),
 organizerBasisPoints:z.literal(7900),retainedBasisPoints:z.literal(2100),reason:z.string().trim().min(8).max(300),issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().positive(),nonce:z.string().uuid()}).strict();
export type AdminProPromotion=z.infer<typeof schema>;
export type PromotionEvidence={revisions:CityRevision[];approvals:ApprovalRecord[];authorizations:AuthorizationRecord[]};

function tags(value:AdminProPromotion){return [["d",`admin-pro:${value.cityId}`],["i",value.cityId],["e",value.revisionId,"","city-revision"],["e",value.approvalEventId,"","city-approval"],["e",value.authorityEventId,"","city-authorization"],["expiration",String(value.expiresAt)]];}
function currentCity(evidence:PromotionEvidence,cityId:string){
 const city=managedCities(evidence.revisions,evidence.approvals).find(row=>row.state==="approved"&&row.revision.city.cityId===cityId);
 const authority=latestCityGrants(evidence.authorizations).find(row=>row.grant.cityId===cityId);
 if(!city||!authority)throw new Error("Promotion requires a currently approved city and current signed owner authority.");
 return {city,authority,owner:cityOwnerPubkey(authority.grant)};
}
export function createAdminProPromotionTemplate(evidence:PromotionEvidence,input:{cityId:string;reason:string;nonce:string},now=Math.floor(Date.now()/1000)):EventTemplate{
 const {city,authority,owner}=currentCity(evidence,input.cityId),value=schema.parse({contract:ADMIN_PRO_PROMOTION_CONTRACT,action:"promote-basic-city-to-pro",cityId:input.cityId,cityName:city.revision.city.cityName,ownerPubkey:owner,
  revisionId:city.revision.event.id,approvalEventId:city.decision.event.id,authorityEventId:authority.event.id,bundle:ADMIN_PRO_BUNDLE,capabilities:ADMIN_PRO_CAPABILITIES,
  organizerBasisPoints:7900,retainedBasisPoints:2100,reason:input.reason,issuedAt:now,expiresAt:now+900,nonce:input.nonce});
 return {kind:27235,created_at:now,tags:tags(value),content:JSON.stringify(value)};
}
function parseAdminProPromotion(event:Event):AdminProPromotion{
 if(event.kind!==27235||event.pubkey!==SUPER_ADMIN_PUBKEY||!verifyEvent(event))throw new Error("Exact BitcoinWalk super-admin signature required.");
 let value:AdminProPromotion;try{value=schema.parse(JSON.parse(event.content));}catch{throw new Error("Invalid administrative Pro promotion contract.");}
 if(event.created_at!==value.issuedAt||value.expiresAt-value.issuedAt!==900||JSON.stringify(event.tags)!==JSON.stringify(tags(value)))throw new Error("Administrative Pro promotion is expired or changed.");
 return value;
}
export function authorizeAdminProPromotion(event:Event,evidence:PromotionEvidence,now=Math.floor(Date.now()/1000)):AdminProPromotion{
 const value=parseAdminProPromotion(event);
 if(value.issuedAt>now+60||value.expiresAt<=now)throw new Error("Administrative Pro promotion is expired or changed.");
 const {city,authority,owner}=currentCity(evidence,value.cityId);
 if(value.cityName!==city.revision.city.cityName||value.ownerPubkey!==owner||value.revisionId!==city.revision.event.id||value.approvalEventId!==city.decision.event.id||value.authorityEventId!==authority.event.id)
  throw new Error("City approval or ownership changed after the promotion was prepared.");
 return value;
}

type AuditRow={cityId:string;entitlementId:string;ownerPubkey:string;revisionId:string;approvalEventId:string;authorityEventId:string;grantEventId:string;grantEvent:string;bundle:string;capabilities:string;organizerBasisPoints:number;retainedBasisPoints:number;reason:string;grantedAt:number};
const auditColumns="cityId,entitlementId,ownerPubkey,revisionId,approvalEventId,authorityEventId,grantEventId,grantEvent,bundle,capabilities,organizerBasisPoints,retainedBasisPoints,reason,grantedAt";
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function installAdminProPromotion(db:DatabaseSync,event:Event,evidence:PromotionEvidence,apply=false,now=Math.floor(Date.now()/1000)){
 let value=parseAdminProPromotion(event);const entitlementId=`admin-pro:${event.id}`,audit:AuditRow={cityId:value.cityId,entitlementId,ownerPubkey:value.ownerPubkey,revisionId:value.revisionId,
  approvalEventId:value.approvalEventId,authorityEventId:value.authorityEventId,grantEventId:event.id,grantEvent:JSON.stringify(event),bundle:value.bundle,capabilities:JSON.stringify(value.capabilities),
  organizerBasisPoints:value.organizerBasisPoints,retainedBasisPoints:value.retainedBasisPoints,reason:value.reason,grantedAt:value.issuedAt};
 const table=(name:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 for(const name of ["payment_invoice","paid_city_entitlement","pro_setup_task"])if(!table(name))throw new Error(`Payments database is missing ${name}.`);
 const existingAudit=table("admin_pro_promotion")?db.prepare(`SELECT ${auditColumns} FROM admin_pro_promotion WHERE cityId=? OR entitlementId=? OR grantEventId=?`).all(value.cityId,entitlementId,event.id) as AuditRow[]:[];
 const invoiceColumns=new Set((db.prepare("PRAGMA table_info(payment_invoice)").all() as Array<{name:string}>).map(row=>row.name)),source=invoiceColumns.has("source")?"source":"'checkout-v1' source";
 const invoice=db.prepare(`SELECT id,cityId,owner,cityName,revisionId,invoice,paymentHash,amountMsat,createdAt,expiresAt,status,settledAt,checkedAt,${source} FROM payment_invoice WHERE cityId=? OR id=? OR paymentHash=?`).all(value.cityId,entitlementId,event.id) as unknown[];
 const entitlement=db.prepare("SELECT cityId,owner,paymentHash,invoiceId,paidAt FROM paid_city_entitlement WHERE cityId=? OR invoiceId=? OR paymentHash=?").all(value.cityId,entitlementId,event.id) as unknown[];
 const setup=db.prepare("SELECT cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,registrationVersion,payoutVersion,brandPubkey,brandVersion,backupAcknowledgedAt,artworkRevisionId,artworkAvatar,artworkBanner,artworkVersion,state,createdAt,updatedAt FROM pro_setup_task WHERE cityId=? OR entitlementId=?").all(value.cityId,entitlementId) as unknown[];
 const expectedInvoice={id:entitlementId,cityId:value.cityId,owner:value.ownerPubkey,cityName:value.cityName,revisionId:value.revisionId,invoice:"",paymentHash:event.id,amountMsat:0,createdAt:value.issuedAt,expiresAt:0,status:"paid",settledAt:value.issuedAt,checkedAt:value.issuedAt,source:"admin-pro-promotion-v1"};
 const expectedEntitlement={cityId:value.cityId,owner:value.ownerPubkey,paymentHash:event.id,invoiceId:entitlementId,paidAt:value.issuedAt};
 const found=existingAudit.length+invoice.length+entitlement.length+setup.length;
 if(found){const task=setup[0] as {cityId?:unknown;entitlementId?:unknown;originalOwnerPubkey?:unknown}|undefined;
  if(existingAudit.length!==1||invoice.length!==1||entitlement.length!==1||setup.length!==1||!same(existingAudit[0],audit)||!same(invoice[0],expectedInvoice)||!same(entitlement[0],expectedEntitlement)||
   task?.cityId!==value.cityId||task.entitlementId!==entitlementId||task.originalOwnerPubkey!==value.ownerPubkey)throw new Error("City already has payment, entitlement, setup or conflicting promotion history.");
  return {created:false,cityId:value.cityId,entitlementId,ownerPubkey:value.ownerPubkey,bundle:value.bundle,capabilities:value.capabilities,organizerBasisPoints:value.organizerBasisPoints,retainedBasisPoints:value.retainedBasisPoints};}
 value=authorizeAdminProPromotion(event,evidence,now);
 if(!apply)return {created:true,cityId:value.cityId,entitlementId,ownerPubkey:value.ownerPubkey,bundle:value.bundle,capabilities:value.capabilities,organizerBasisPoints:value.organizerBasisPoints,retainedBasisPoints:value.retainedBasisPoints};
 if(!invoiceColumns.has("source"))db.exec("ALTER TABLE payment_invoice ADD COLUMN source TEXT NOT NULL DEFAULT 'checkout-v1'");
 db.exec(`CREATE TABLE IF NOT EXISTS admin_pro_promotion(cityId TEXT PRIMARY KEY,entitlementId TEXT NOT NULL UNIQUE,ownerPubkey TEXT NOT NULL,revisionId TEXT NOT NULL,approvalEventId TEXT NOT NULL,
  authorityEventId TEXT NOT NULL,grantEventId TEXT NOT NULL UNIQUE,grantEvent TEXT NOT NULL,bundle TEXT NOT NULL,capabilities TEXT NOT NULL,organizerBasisPoints INTEGER NOT NULL,retainedBasisPoints INTEGER NOT NULL,
  reason TEXT NOT NULL,grantedAt INTEGER NOT NULL);`);
 db.prepare(`INSERT INTO admin_pro_promotion(${auditColumns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(audit));
 db.prepare("INSERT INTO payment_invoice(id,cityId,owner,cityName,revisionId,invoice,paymentHash,amountMsat,createdAt,expiresAt,status,settledAt,checkedAt,source) VALUES(?,?,?,?,?,'',?,0,?,0,'paid',?,?,'admin-pro-promotion-v1')")
  .run(entitlementId,value.cityId,value.ownerPubkey,value.cityName,value.revisionId,event.id,value.issuedAt,value.issuedAt,value.issuedAt);
 db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(value.cityId,value.ownerPubkey,event.id,entitlementId,value.issuedAt);
 db.prepare(`INSERT INTO pro_setup_task(cityId,entitlementId,originalOwnerPubkey,currentOwnerPubkey,registrationVersion,payoutVersion,brandPubkey,brandVersion,backupAcknowledgedAt,artworkRevisionId,artworkAvatar,artworkBanner,artworkVersion,state,createdAt,updatedAt)
  VALUES(?,?,?,?,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,0,'setup-required',?,?)`).run(value.cityId,entitlementId,value.ownerPubkey,value.ownerPubkey,value.issuedAt,value.issuedAt);
 return {created:true,cityId:value.cityId,entitlementId,ownerPubkey:value.ownerPubkey,bundle:value.bundle,capabilities:value.capabilities,organizerBasisPoints:value.organizerBasisPoints,retainedBasisPoints:value.retainedBasisPoints};
}
