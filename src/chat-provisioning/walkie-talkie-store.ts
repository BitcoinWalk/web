import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {ChatProvisionAuthority,ChatProvisionPhase,ChatProvisionTier,ChatVerification} from "./store";

export const WALKIE_TALKIE_RELAY="wss://chat.bitcoinwalk.org/";
const cityIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const hexPattern=/^[0-9a-f]{64}$/;
const bindingPattern=/^[A-Za-z0-9_-]{1,128}$/;

export type WalkieTalkieProvisionRow={cityId:string;authorityId:string;tier:ChatProvisionTier;slug:string;relay:string;groupId:string;phase:ChatProvisionPhase;evidenceDigest:string|null;metadataEventId:string|null;verifiedAt:number|null;activatedAt:number|null;publicEnabled:0|1;visibilityUpdatedAt:number|null;createdAt:number;updatedAt:number};
type Input={cityId:string;slug:string;groupId:string};

function evidence(row:{cityId:string;authorityId:string;slug:string;relay:string;groupId:string},verification:ChatVerification){
 return createHash("sha256").update(JSON.stringify({version:1,...row,metadataEventId:verification.metadataEventId,publiclyReadable:verification.publiclyReadable,openJoin:verification.openJoin})).digest("hex");
}
function authority(value:ChatProvisionAuthority){
 if((value.tier!=="basic"&&value.tier!=="pro")||!bindingPattern.test(value.bindingId)||value.relay!==WALKIE_TALKIE_RELAY)throw new Error("The current Walkie Talkie authority is invalid.");
 return value;
}

export class WalkieTalkieProvisionStore{
 constructor(readonly db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS city_walkie_talkie_provisioning(
  cityId TEXT PRIMARY KEY,authorityId TEXT NOT NULL,tier TEXT NOT NULL,slug TEXT NOT NULL,relay TEXT NOT NULL,groupId TEXT NOT NULL,
  phase TEXT NOT NULL,evidenceDigest TEXT,metadataEventId TEXT,verifiedAt INTEGER,activatedAt INTEGER,publicEnabled INTEGER NOT NULL DEFAULT 1,visibilityUpdatedAt INTEGER,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,
  UNIQUE(relay,groupId));`);
  const columns=this.db.prepare("PRAGMA table_info(city_walkie_talkie_provisioning)").all() as Array<{name:string}>,names=new Set(columns.map(column=>column.name));
  if(!names.has("publicEnabled"))this.db.exec("ALTER TABLE city_walkie_talkie_provisioning ADD COLUMN publicEnabled INTEGER NOT NULL DEFAULT 1");
  if(!names.has("visibilityUpdatedAt"))this.db.exec("ALTER TABLE city_walkie_talkie_provisioning ADD COLUMN visibilityUpdatedAt INTEGER");
  const legacy=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='city_chat_provisioning'").get();
  if(legacy)this.db.exec(`INSERT OR IGNORE INTO city_walkie_talkie_provisioning(cityId,authorityId,tier,slug,relay,groupId,phase,evidenceDigest,metadataEventId,verifiedAt,activatedAt,createdAt,updatedAt)
   SELECT cityId,entitlementId,tier,slug,relay,groupId,phase,evidenceDigest,metadataEventId,verifiedAt,activatedAt,createdAt,updatedAt
   FROM city_chat_provisioning WHERE tier='basic' AND relay='${WALKIE_TALKIE_RELAY}' AND groupId='bitcoinwalk-'||slug;`);
 }
 get(cityId:string){return this.db.prepare("SELECT * FROM city_walkie_talkie_provisioning WHERE cityId=?").get(cityId) as WalkieTalkieProvisionRow|undefined;}
 rows(){return this.db.prepare("SELECT * FROM city_walkie_talkie_provisioning ORDER BY slug,cityId").all() as WalkieTalkieProvisionRow[];}
 active(){return this.db.prepare("SELECT * FROM city_walkie_talkie_provisioning WHERE phase='active' ORDER BY slug,cityId").all() as WalkieTalkieProvisionRow[];}
 private assert(row:WalkieTalkieProvisionRow,supplied:ChatProvisionAuthority){const current=authority(supplied);if(row.authorityId!==current.bindingId||row.tier!==current.tier||row.relay!==current.relay)throw new Error("The Walkie Talkie authority changed; operator review is required.");}
 propose(input:Input,now=Math.floor(Date.now()/1000),supplied:ChatProvisionAuthority){
  const current=authority(supplied),groupId=`bitcoinwalk-${input.slug}`,existing=this.get(input.cityId);
  if(!cityIdPattern.test(input.cityId)||!slugPattern.test(input.slug)||input.groupId!==groupId)throw new Error("Use the canonical shared city channel.");
  if(existing?.phase==="active"&&(existing.authorityId!==current.bindingId||existing.tier!==current.tier||existing.slug!==input.slug||existing.groupId!==groupId))throw new Error("An active Walkie Talkie channel cannot be replaced implicitly.");
  if(existing&&(existing.authorityId!==current.bindingId||existing.tier!==current.tier))throw new Error("The Walkie Talkie authority changed; operator review is required.");
  this.db.prepare(`INSERT INTO city_walkie_talkie_provisioning(cityId,authorityId,tier,slug,relay,groupId,phase,createdAt,updatedAt)
   VALUES(?,?,?,?,?,?,'candidate',?,?) ON CONFLICT(cityId) DO UPDATE SET slug=excluded.slug,relay=excluded.relay,groupId=excluded.groupId,
   phase='candidate',evidenceDigest=NULL,metadataEventId=NULL,verifiedAt=NULL,activatedAt=NULL,updatedAt=excluded.updatedAt`)
   .run(input.cityId,current.bindingId,current.tier,input.slug,WALKIE_TALKIE_RELAY,groupId,now,now);
  return this.get(input.cityId)!;
 }
 verify(cityId:string,verification:ChatVerification,now=Math.floor(Date.now()/1000),supplied:ChatProvisionAuthority){
  const row=this.get(cityId);if(!row||row.phase!=="candidate"&&row.phase!=="verified")throw new Error("Prepare the exact Walkie Talkie channel before verification.");this.assert(row,supplied);
  if(!hexPattern.test(verification.metadataEventId)||!verification.publiclyReadable||!verification.openJoin)throw new Error("The NIP-29 channel must be publicly discoverable and open to join.");
  const evidenceDigest=evidence(row,verification);this.db.prepare("UPDATE city_walkie_talkie_provisioning SET phase='verified',evidenceDigest=?,metadataEventId=?,verifiedAt=?,activatedAt=NULL,updatedAt=? WHERE cityId=?").run(evidenceDigest,verification.metadataEventId,now,now,cityId);return this.get(cityId)!;
 }
	 activate(cityId:string,evidenceDigest:string,now=Math.floor(Date.now()/1000),supplied:ChatProvisionAuthority){const row=this.get(cityId);if(!row||row.phase!=="verified"||row.evidenceDigest!==evidenceDigest||!hexPattern.test(evidenceDigest))throw new Error("Fresh verified Walkie Talkie evidence is required before activation.");this.assert(row,supplied);this.db.prepare("UPDATE city_walkie_talkie_provisioning SET phase='active',activatedAt=?,updatedAt=? WHERE cityId=? AND phase='verified' AND evidenceDigest=?").run(now,now,cityId,evidenceDigest);return this.get(cityId)!;}
	 refresh(cityId:string,currentEvidenceDigest:string,verification:ChatVerification,now=Math.floor(Date.now()/1000),supplied:ChatProvisionAuthority){const row=this.get(cityId);if(!row||row.phase!=="active"||row.evidenceDigest!==currentEvidenceDigest||!hexPattern.test(currentEvidenceDigest))throw new Error("The active Walkie Talkie channel changed. Refresh and retry.");this.assert(row,supplied);if(!hexPattern.test(verification.metadataEventId)||!verification.publiclyReadable||!verification.openJoin)throw new Error("The NIP-29 channel must remain publicly discoverable and open to join.");const evidenceDigest=evidence(row,verification),result=this.db.prepare("UPDATE city_walkie_talkie_provisioning SET evidenceDigest=?,metadataEventId=?,verifiedAt=?,updatedAt=? WHERE cityId=? AND phase='active' AND evidenceDigest=?").run(evidenceDigest,verification.metadataEventId,now,now,cityId,currentEvidenceDigest);if(result.changes!==1)throw new Error("The active Walkie Talkie channel changed. Refresh and retry.");return this.get(cityId)!;}
	 setVisibility(cityId:string,enabled:boolean,now=Math.floor(Date.now()/1000),supplied:ChatProvisionAuthority){const row=this.get(cityId);if(!row||row.phase!=="active")throw new Error("Active Walkie Talkie activation is required before changing public visibility.");this.assert(row,supplied);const result=this.db.prepare("UPDATE city_walkie_talkie_provisioning SET publicEnabled=?,visibilityUpdatedAt=?,updatedAt=? WHERE cityId=? AND phase='active'").run(enabled?1:0,now,now,cityId);if(result.changes!==1)throw new Error("The active Walkie Talkie channel changed. Refresh and try again.");return this.get(cityId)!;}
}
