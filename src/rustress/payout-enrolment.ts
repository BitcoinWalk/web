import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {managedProvisionConfigSchema,provisionDigest,type ProvisionConfig} from "./contract";
import {PAYOUT_AUTHORITY_API} from "./payout-authority";

export type PayoutAuthorityReceipt={api:typeof PAYOUT_AUTHORITY_API;state:"recorded";cityId:string;payoutVersion:number;configHash:string};
export class PayoutEnrolmentError extends Error{constructor(readonly outcome:"absent"|"rejected"|"unknown"){super(`Payout enrolment ${outcome}`);}}
export type PayoutAuthorityProvider={status(config:ProvisionConfig):Promise<PayoutAuthorityReceipt>;register(config:ProvisionConfig):Promise<PayoutAuthorityReceipt>};
type Row={city:string;payout_version:number;config_hash:string;document:string;state:"queued"|"unknown"|"active"|"blocked";lease:string|null;until:number;updated_at:number};

/** Durable, default-off bridge from an already verified city activation to the
 * separately authenticated payout authority. It cannot create a destination,
 * issue an invoice, fund a wallet or enlarge the signed operation policy. */
export class PayoutEnrolmentWorkflow{
 constructor(private db:DatabaseSync,private provider:PayoutAuthorityProvider,
  private fresh:(config:ProvisionConfig)=>Promise<ProvisionConfig>,private now=()=>Date.now()){
  db.exec(`CREATE TABLE IF NOT EXISTS rustress_payout_enrolment_task(
   city TEXT NOT NULL,payout_version INTEGER NOT NULL,config_hash TEXT NOT NULL,document TEXT NOT NULL,state TEXT NOT NULL,
   lease TEXT,until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(city,payout_version));`);
 }
 private row(city:string,payoutVersion?:number){return (payoutVersion===undefined?
  this.db.prepare("SELECT * FROM rustress_payout_enrolment_task WHERE city=? ORDER BY payout_version DESC LIMIT 1").get(city):
  this.db.prepare("SELECT * FROM rustress_payout_enrolment_task WHERE city=? AND payout_version=?").get(city,payoutVersion)) as Row|undefined;}
 status(city:string){const row=this.row(city);return row?{cityId:city,payoutVersion:row.payout_version,state:row.state,updatedAt:row.updated_at}:null;}
 enqueue(input:unknown){const config=managedProvisionConfigSchema.parse(input);if(config.invoiceIssuance!=="enabled")throw new Error("Active invoice configuration required.");
  const document=JSON.stringify(config),hash=provisionDigest(config),old=this.row(config.cityId,config.payoutVersion),now=this.now();
  if(old&&(old.document!==document||old.config_hash!==hash))throw new Error("Existing payout enrolment requires review; no authority was replaced.");
  if(!old)this.db.prepare("INSERT INTO rustress_payout_enrolment_task VALUES(?,?,?,?, 'queued',NULL,0,?)").run(config.cityId,config.payoutVersion,hash,document,now);
  return this.status(config.cityId);
 }
 async run(city:string){const initial=this.row(city);if(!initial||initial.state==="active"||initial.state==="blocked")return this.status(city);
  const lease=randomUUID(),now=this.now(),claim=this.db.prepare("UPDATE rustress_payout_enrolment_task SET lease=?,until=? WHERE city=? AND payout_version=? AND (lease IS NULL OR until<=?)")
   .run(lease,now+120_000,city,initial.payout_version,now);if(!claim.changes)return this.status(city);
  const config=managedProvisionConfigSchema.parse(JSON.parse(initial.document));
  const exact=(receipt:PayoutAuthorityReceipt)=>{if(receipt.api!==PAYOUT_AUTHORITY_API||receipt.state!=="recorded"||receipt.cityId!==city||
   receipt.payoutVersion!==config.payoutVersion||receipt.configHash!==initial.config_hash)throw new PayoutEnrolmentError("unknown");return receipt;};
  try{
   const current=managedProvisionConfigSchema.parse(await this.fresh(config));if(JSON.stringify(current)!==initial.document)throw new Error("changed");
   let receipt:PayoutAuthorityReceipt;try{receipt=exact(await this.provider.status(config));}catch(error){
    if(!(error instanceof PayoutEnrolmentError)||error.outcome!=="absent")throw error;
    exact(await this.provider.register(config));receipt=exact(await this.provider.status(config));
   }
   exact(receipt);this.db.prepare("UPDATE rustress_payout_enrolment_task SET state='active',updated_at=? WHERE city=? AND payout_version=? AND lease=?").run(this.now(),city,config.payoutVersion,lease);
  }catch(error){const state=error instanceof Error&&error.message==="changed"||error instanceof PayoutEnrolmentError&&error.outcome==="rejected"?"blocked":"unknown";
   this.db.prepare("UPDATE rustress_payout_enrolment_task SET state=?,updated_at=? WHERE city=? AND payout_version=? AND lease=?").run(state,this.now(),city,config.payoutVersion,lease);
  }finally{this.db.prepare("UPDATE rustress_payout_enrolment_task SET lease=NULL,until=0 WHERE city=? AND payout_version=? AND lease=?").run(city,config.payoutVersion,lease);}
  return this.status(city);
 }
}
