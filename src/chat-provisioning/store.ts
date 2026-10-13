import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";

const cityIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const groupPattern=/^[A-Za-z0-9_-]{1,128}$/;
const hexPattern=/^[0-9a-f]{64}$/;

export type ChatProvisionPhase="candidate"|"verified"|"active"|"needs-attention";
export type ChatVisibilitySurface="walkie-talkie"|"armada";
export type ChatProvisionRow={cityId:string;entitlementId:string;slug:string;relay:string;groupId:string;phase:ChatProvisionPhase;evidenceDigest:string|null;metadataEventId:string|null;verifiedAt:number|null;activatedAt:number|null;walkieTalkieEnabled:0|1;armadaEnabled:0|1;visibilityUpdatedAt:number|null;createdAt:number;updatedAt:number};
export type ChatProvisionInput={cityId:string;slug:string;groupId:string};
export type ChatVerification={metadataEventId:string;publiclyReadable:boolean;openJoin:boolean};

function destination(slug:string){return `wss://${slug}.bitcoinwalk.org/`;}
function digest(row:{cityId:string;entitlementId:string;slug:string;relay:string;groupId:string},verification:ChatVerification){
 const evidence={version:1,cityId:row.cityId,entitlementId:row.entitlementId,slug:row.slug,relay:row.relay,groupId:row.groupId,metadataEventId:verification.metadataEventId,publiclyReadable:verification.publiclyReadable,openJoin:verification.openJoin};
 return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

export class ChatProvisionStore{
 constructor(readonly db:DatabaseSync){
  db.exec(`CREATE TABLE IF NOT EXISTS city_chat_provisioning(
   cityId TEXT PRIMARY KEY,entitlementId TEXT NOT NULL,slug TEXT NOT NULL,relay TEXT NOT NULL,groupId TEXT NOT NULL,
   phase TEXT NOT NULL,evidenceDigest TEXT,metadataEventId TEXT,verifiedAt INTEGER,activatedAt INTEGER,walkieTalkieEnabled INTEGER NOT NULL DEFAULT 0,armadaEnabled INTEGER NOT NULL DEFAULT 1,visibilityUpdatedAt INTEGER,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,
   UNIQUE(relay,groupId));`);
  const columns=this.db.prepare("PRAGMA table_info(city_chat_provisioning)").all() as Array<{name:string}>;
  const names=new Set(columns.map(column=>column.name));
  if(!names.has("walkieTalkieEnabled"))this.db.exec("ALTER TABLE city_chat_provisioning ADD COLUMN walkieTalkieEnabled INTEGER NOT NULL DEFAULT 0");
  if(!names.has("armadaEnabled")){
   this.db.exec("ALTER TABLE city_chat_provisioning ADD COLUMN armadaEnabled INTEGER NOT NULL DEFAULT 1");
   if(names.has("publicEnabled"))this.db.exec("UPDATE city_chat_provisioning SET armadaEnabled=publicEnabled");
  }
  if(!names.has("visibilityUpdatedAt")){
   this.db.exec("ALTER TABLE city_chat_provisioning ADD COLUMN visibilityUpdatedAt INTEGER");
   if(names.has("publicUpdatedAt"))this.db.exec("UPDATE city_chat_provisioning SET visibilityUpdatedAt=publicUpdatedAt");
  }
 }
 private entitlement(cityId:string){return this.db.prepare("SELECT invoiceId FROM paid_city_entitlement WHERE cityId=?").get(cityId) as {invoiceId:string}|undefined;}
 get(cityId:string){return this.db.prepare("SELECT * FROM city_chat_provisioning WHERE cityId=?").get(cityId) as ChatProvisionRow|undefined;}
 rows(){return this.db.prepare("SELECT * FROM city_chat_provisioning ORDER BY slug,cityId").all() as ChatProvisionRow[];}
 active(){return this.db.prepare("SELECT * FROM city_chat_provisioning WHERE phase='active' ORDER BY slug,cityId").all() as ChatProvisionRow[];}
 propose(input:ChatProvisionInput,now=Math.floor(Date.now()/1000)){
  if(!cityIdPattern.test(input.cityId)||!slugPattern.test(input.slug)||!groupPattern.test(input.groupId))throw new Error("Enter a valid paid city, canonical slug and NIP-29 group ID.");
  const entitlement=this.entitlement(input.cityId);if(!entitlement)throw new Error("A settled Pro entitlement is required before chat provisioning.");
  const relay=destination(input.slug),existing=this.get(input.cityId);
  if(existing?.phase==="active"&&(existing.entitlementId!==entitlement.invoiceId||existing.slug!==input.slug||existing.relay!==relay||existing.groupId!==input.groupId))throw new Error("Active chat provisioning cannot be replaced without an explicit revocation workflow.");
  if(existing&&existing.entitlementId!==entitlement.invoiceId)throw new Error("Chat provisioning entitlement changed; operator review is required.");
  this.db.prepare(`INSERT INTO city_chat_provisioning(cityId,entitlementId,slug,relay,groupId,phase,createdAt,updatedAt)
   VALUES(?,?,?,?,?,'candidate',?,?) ON CONFLICT(cityId) DO UPDATE SET slug=excluded.slug,relay=excluded.relay,groupId=excluded.groupId,
   phase='candidate',evidenceDigest=NULL,metadataEventId=NULL,verifiedAt=NULL,activatedAt=NULL,updatedAt=excluded.updatedAt`)
   .run(input.cityId,entitlement.invoiceId,input.slug,relay,input.groupId,now,now);
  return this.get(input.cityId)!;
 }
 verify(cityId:string,verification:ChatVerification,now=Math.floor(Date.now()/1000)){
  const row=this.get(cityId);if(!row||row.phase!=="candidate"&&row.phase!=="verified")throw new Error("Prepare the exact chat destination before verification.");
  const entitlement=this.entitlement(cityId);if(!entitlement||entitlement.invoiceId!==row.entitlementId)throw new Error("The settled Pro entitlement changed before verification.");
  if(!hexPattern.test(verification.metadataEventId)||!verification.publiclyReadable||!verification.openJoin)throw new Error("The NIP-29 group must be publicly readable and open to join.");
  const evidenceDigest=digest(row,verification);
  this.db.prepare("UPDATE city_chat_provisioning SET phase='verified',evidenceDigest=?,metadataEventId=?,verifiedAt=?,activatedAt=NULL,updatedAt=? WHERE cityId=?")
   .run(evidenceDigest,verification.metadataEventId,now,now,cityId);
  return this.get(cityId)!;
 }
 activate(cityId:string,evidenceDigest:string,now=Math.floor(Date.now()/1000)){
  const row=this.get(cityId);if(!row||row.phase!=="verified"||row.evidenceDigest!==evidenceDigest||!hexPattern.test(evidenceDigest))throw new Error("Fresh verified chat evidence is required before activation.");
  const entitlement=this.entitlement(cityId);if(!entitlement||entitlement.invoiceId!==row.entitlementId)throw new Error("The settled Pro entitlement changed before activation.");
  this.db.prepare("UPDATE city_chat_provisioning SET phase='active',activatedAt=?,updatedAt=? WHERE cityId=? AND phase='verified' AND evidenceDigest=?")
   .run(now,now,cityId,evidenceDigest);
  return this.get(cityId)!;
 }
 refreshActiveMetadata(cityId:string,currentEvidenceDigest:string,verification:ChatVerification,now=Math.floor(Date.now()/1000)){
  const row=this.get(cityId);if(!row||row.phase!=="active"||row.evidenceDigest!==currentEvidenceDigest||!hexPattern.test(currentEvidenceDigest))throw new Error("The active community changed. Refresh and retry.");
  const entitlement=this.entitlement(cityId);if(!entitlement||entitlement.invoiceId!==row.entitlementId)throw new Error("The settled Pro entitlement changed before the metadata refresh.");
  if(!hexPattern.test(verification.metadataEventId)||!verification.publiclyReadable||!verification.openJoin)throw new Error("The NIP-29 group must remain publicly readable and open to join.");
  const evidenceDigest=digest(row,verification),result=this.db.prepare("UPDATE city_chat_provisioning SET evidenceDigest=?,metadataEventId=?,verifiedAt=?,updatedAt=? WHERE cityId=? AND phase='active' AND evidenceDigest=?")
   .run(evidenceDigest,verification.metadataEventId,now,now,cityId,currentEvidenceDigest);
  if(result.changes!==1)throw new Error("The active community changed. Refresh and retry.");
  return this.get(cityId)!;
 }
 setVisibility(cityId:string,surface:ChatVisibilitySurface,enabled:boolean,now=Math.floor(Date.now()/1000)){
  const row=this.get(cityId);if(!row||row.phase!=="active")throw new Error("Active community activation is required before changing public visibility.");
  const entitlement=this.entitlement(cityId);if(!entitlement||entitlement.invoiceId!==row.entitlementId)throw new Error("The settled Pro entitlement changed before the visibility update.");
  const column=surface==="walkie-talkie"?"walkieTalkieEnabled":"armadaEnabled";
  this.db.prepare(`UPDATE city_chat_provisioning SET ${column}=?,visibilityUpdatedAt=?,updatedAt=? WHERE cityId=? AND phase='active'`).run(enabled?1:0,now,now,cityId);
  return this.get(cityId)!;
 }
 markAttention(cityId:string,now=Math.floor(Date.now()/1000)){
  this.db.prepare("UPDATE city_chat_provisioning SET phase='needs-attention',activatedAt=NULL,updatedAt=? WHERE cityId=?").run(now,cityId);
  return this.get(cityId);
 }
}
