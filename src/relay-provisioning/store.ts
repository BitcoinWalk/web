import {createHash} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";

export type RelayProvisionPhase="queued"|"leased"|"provisioned"|"needs-attention";
export type RelayProvisionManifest={
 version:1;cityId:string;slug:string;cityName:string;destination:string;approvalEventId:string;entitlementId:string;evidenceDigest:string;replicationServicePubkey:string;
};
export type RelayProvisionEvidence={containerNonRoot:boolean;readOnly:boolean;noPublishedPorts:boolean;restartStable:boolean;emptyExact:boolean;gatewayRouted:boolean};
export type RelayProvisionTask=RelayProvisionManifest&{revisionId:string;phase:RelayProvisionPhase;attempts:number;requestedAt:number;updatedAt:number;leaseUntil:number|null;evidence:RelayProvisionEvidence|null;failureCode:string|null};

const hex=/^[0-9a-f]{64}$/,slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,failureCodes=new Set(["apply-failed","evidence-mismatch","gateway-unavailable","host-capacity","operator-review"]);
export const REPLICATION_SERVICE_PUBKEY="a6c0c0aba1385505e1e1db704934a67d93fac6c5561d8f256e6dcac1df2ed448";
const canonical=(input:Omit<RelayProvisionManifest,"evidenceDigest">)=>JSON.stringify(input);
const digest=(input:Omit<RelayProvisionManifest,"evidenceDigest">)=>createHash("sha256").update(canonical(input)).digest("hex");
const validSlug=(value:string)=>slugPattern.test(value)&&value.length<=63;
const completeEvidence=(value:RelayProvisionEvidence)=>value&&value.containerNonRoot===true&&value.readOnly===true&&value.noPublishedPorts===true&&value.restartStable===true&&value.emptyExact===true&&value.gatewayRouted===true&&Object.keys(value).length===6;

export class RelayProvisionStore{
 constructor(readonly db:DatabaseSync,private now=()=>Math.floor(Date.now()/1000)){
  db.exec(`CREATE TABLE IF NOT EXISTS city_relay_provision_task(
   cityId TEXT PRIMARY KEY,revisionId TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,cityName TEXT NOT NULL,approvalEventId TEXT NOT NULL UNIQUE,
   entitlementId TEXT NOT NULL,evidenceDigest TEXT NOT NULL UNIQUE,phase TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
   requestedAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,leaseUntil INTEGER,evidence TEXT,failureCode TEXT);
   CREATE INDEX IF NOT EXISTS city_relay_provision_due ON city_relay_provision_task(phase,leaseUntil,requestedAt);`);
 }
 enqueue(input:{cityId:string;revisionId:string;slug:string;cityName:string;approvalEventId:string}):RelayProvisionTask{
  if(!validSlug(input.slug)||!hex.test(input.revisionId)||!hex.test(input.approvalEventId))throw new Error("Invalid paid-city relay approval scope.");
  const entitlement=this.db.prepare("SELECT paymentHash FROM paid_city_entitlement WHERE cityId=?").get(input.cityId) as {paymentHash:string}|undefined;
  if(!entitlement||!hex.test(entitlement.paymentHash))throw new Error("A verified paid-city entitlement is required before relay provisioning.");
  const base={version:1 as const,cityId:input.cityId,slug:input.slug,cityName:input.cityName,destination:`wss://${input.slug}.bitcoinwalk.org/`,approvalEventId:input.approvalEventId,entitlementId:entitlement.paymentHash,replicationServicePubkey:REPLICATION_SERVICE_PUBKEY};
  const evidenceDigest=digest(base),now=this.now();
  this.db.prepare(`INSERT OR IGNORE INTO city_relay_provision_task(cityId,revisionId,slug,cityName,approvalEventId,entitlementId,evidenceDigest,phase,requestedAt,updatedAt)
   VALUES(?,?,?,?,?,?,?,'queued',?,?)`).run(input.cityId,input.revisionId,input.slug,input.cityName,input.approvalEventId,entitlement.paymentHash,evidenceDigest,now,now);
  const row=this.row(input.cityId);
  if(!row||row.revisionId!==input.revisionId||row.slug!==input.slug||row.cityName!==input.cityName||row.approvalEventId!==input.approvalEventId||row.entitlementId!==entitlement.paymentHash||row.evidenceDigest!==evidenceDigest)
   throw new Error("Existing city relay provisioning scope requires operator review.");
  return row;
 }
 row(cityId:string):RelayProvisionTask|undefined{
  const row=this.db.prepare("SELECT * FROM city_relay_provision_task WHERE cityId=?").get(cityId) as Record<string,unknown>|undefined;
  return row?this.decode(row):undefined;
 }
 claim(leaseSeconds=120):RelayProvisionTask|undefined{
  const now=this.now();this.db.exec("BEGIN IMMEDIATE");
  try{
   const candidate=this.db.prepare(`SELECT cityId FROM city_relay_provision_task WHERE phase='queued' OR (phase='leased' AND leaseUntil<=?) ORDER BY requestedAt,cityId LIMIT 1`).get(now) as {cityId:string}|undefined;
   if(!candidate){this.db.exec("COMMIT");return undefined;}
   this.db.prepare("UPDATE city_relay_provision_task SET phase='leased',attempts=attempts+1,leaseUntil=?,updatedAt=? WHERE cityId=?").run(now+leaseSeconds,now,candidate.cityId);
   this.db.exec("COMMIT");return this.row(candidate.cityId);
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
 complete(cityId:string,evidenceDigest:string,result:{phase:"provisioned";evidence:RelayProvisionEvidence}|{phase:"needs-attention";failureCode:string}):RelayProvisionTask{
  const row=this.row(cityId);if(!row||row.phase!=="leased"||row.evidenceDigest!==evidenceDigest)throw new Error("Provisioning lease or evidence commitment does not match.");
  const now=this.now();
  if(result.phase==="provisioned"){
   if(!completeEvidence(result.evidence))throw new Error("Incomplete city relay acceptance evidence.");
   this.db.prepare("UPDATE city_relay_provision_task SET phase='provisioned',updatedAt=?,leaseUntil=NULL,evidence=?,failureCode=NULL WHERE cityId=?").run(now,JSON.stringify(result.evidence),cityId);
  }else{
   if(!failureCodes.has(result.failureCode))throw new Error("Invalid city relay failure code.");
   this.db.prepare("UPDATE city_relay_provision_task SET phase='needs-attention',updatedAt=?,leaseUntil=NULL,evidence=NULL,failureCode=? WHERE cityId=?").run(now,result.failureCode,cityId);
  }
  return this.row(cityId)!;
 }
 retry(cityId:string){const row=this.row(cityId);if(!row||row.phase!=="needs-attention")throw new Error("City relay task is not retryable.");this.db.prepare("UPDATE city_relay_provision_task SET phase='queued',updatedAt=?,failureCode=NULL WHERE cityId=?").run(this.now(),cityId);}
 manifest(row:RelayProvisionTask):RelayProvisionManifest{return {version:1,cityId:row.cityId,slug:row.slug,cityName:row.cityName,destination:row.destination,approvalEventId:row.approvalEventId,entitlementId:row.entitlementId,evidenceDigest:row.evidenceDigest,replicationServicePubkey:row.replicationServicePubkey};}
 private decode(row:Record<string,unknown>):RelayProvisionTask{
  const base={version:1 as const,cityId:String(row.cityId),slug:String(row.slug),cityName:String(row.cityName),destination:`wss://${String(row.slug)}.bitcoinwalk.org/`,approvalEventId:String(row.approvalEventId),entitlementId:String(row.entitlementId),evidenceDigest:String(row.evidenceDigest),replicationServicePubkey:REPLICATION_SERVICE_PUBKEY};
  if(digest({...base,evidenceDigest:undefined} as never)!==base.evidenceDigest)throw new Error("City relay provisioning evidence is corrupt.");
  return {...base,revisionId:String(row.revisionId),phase:String(row.phase) as RelayProvisionPhase,attempts:Number(row.attempts),requestedAt:Number(row.requestedAt),updatedAt:Number(row.updatedAt),leaseUntil:row.leaseUntil===null?null:Number(row.leaseUntil),evidence:row.evidence?JSON.parse(String(row.evidence)) as RelayProvisionEvidence:null,failureCode:row.failureCode===null?null:String(row.failureCode)};
 }
}
