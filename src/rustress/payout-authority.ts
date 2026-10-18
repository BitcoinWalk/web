import type {DatabaseSync} from "node:sqlite";
import {managedProvisionConfigSchema,provisionDigest,type ProvisionConfig} from "./contract";
import {VERIFIED_PRO_CITY_SCOPE} from "./scoped-payout-operation";

export const PAYOUT_AUTHORITY_API="bitcoinwalk-payout-authority-v1";
export type PayoutAuthorityScope={cityScope:typeof VERIFIED_PRO_CITY_SCOPE;maximumCities:number};
export class PayoutAuthorityStore{
 constructor(private db:DatabaseSync,private policy?:ReadonlySet<string>|PayoutAuthorityScope){db.exec(`CREATE TABLE IF NOT EXISTS bw_payout_authority(
  city TEXT NOT NULL,version INTEGER NOT NULL,config_hash TEXT NOT NULL,document TEXT NOT NULL,PRIMARY KEY(city,version));`);}
 private allowed(cityId:string,registering=false){
  if(!this.policy)return;
  if("has" in this.policy){if(!this.policy.has(cityId))throw new Error("City is outside payout operation authority");return;}
  if(this.policy.cityScope!==VERIFIED_PRO_CITY_SCOPE||!Number.isSafeInteger(this.policy.maximumCities)||this.policy.maximumCities<1||this.policy.maximumCities>100)
    throw new Error("Invalid payout operation scope");
  if(registering&&!this.db.prepare("SELECT 1 FROM bw_payout_authority WHERE city=?").get(cityId)){
    const count=Number((this.db.prepare("SELECT COUNT(DISTINCT city) count FROM bw_payout_authority").get() as {count:number}).count);
    if(count>=this.policy.maximumCities)throw new Error("Payout operation city capacity reached");
  }
 }
 register(input:unknown){
  const config=managedProvisionConfigSchema.parse(input),hash=provisionDigest(config),document=JSON.stringify(config);
  this.allowed(config.cityId,true);
  const old=this.db.prepare("SELECT config_hash,document FROM bw_payout_authority WHERE city=? AND version=?").get(config.cityId,config.payoutVersion) as {config_hash:string;document:string}|undefined;
  if(old){if(old.config_hash!==hash||old.document!==document)throw new Error("Payout authority conflict");return {api:PAYOUT_AUTHORITY_API,state:"recorded" as const,cityId:config.cityId,payoutVersion:config.payoutVersion,configHash:hash};}
  this.db.prepare("INSERT INTO bw_payout_authority VALUES(?,?,?,?)").run(config.cityId,config.payoutVersion,hash,document);
  return {api:PAYOUT_AUTHORITY_API,state:"recorded" as const,cityId:config.cityId,payoutVersion:config.payoutVersion,configHash:hash};
 }
 resolve(cityId:string,payoutVersion:number){
  this.allowed(cityId);
  const row=this.db.prepare("SELECT document FROM bw_payout_authority WHERE city=? AND version=?").get(cityId,payoutVersion) as {document:string}|undefined;
  if(!row)return null;const config=managedProvisionConfigSchema.parse(JSON.parse(row.document)) as ProvisionConfig;
  return {cityId:config.cityId,walletRef:config.walletRef,destinationVersion:config.payoutVersion,destination:config.payoutDestination};
 }
 resolveInvoice(cityId:string,payoutVersion:number){
  this.allowed(cityId);
  const row=this.db.prepare("SELECT document FROM bw_payout_authority WHERE city=? AND version=?").get(cityId,payoutVersion) as {document:string}|undefined;
  if(!row)return null;const config=managedProvisionConfigSchema.parse(JSON.parse(row.document)) as ProvisionConfig;
  if(config.invoiceIssuance!=="enabled")return null;
  return {...this.resolve(cityId,payoutVersion)!,invoiceIssuance:"enabled" as const};
 }
 count(){return Number((this.db.prepare("SELECT COUNT(*) count FROM bw_payout_authority").get() as {count:number}).count);}
}
