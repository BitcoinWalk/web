import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {ProvisioningError} from "./client";
import {activationReceiptSchema,managedProvisionConfigSchema,provisionDigest,type ActivationReceipt,type ProvisionConfig} from "./contract";
import {PublicProvisioningError} from "./public-provisioning";

export type PayoutUpdateEvidence={config:ProvisionConfig;proofHash:string;publicOrigin:string};
type Phase="queued"|"preparing"|"prepared"|"applying"|"verifying"|"unknown"|"needs-attention"|"active"|"blocked";
type Row={city:string;payout_version:number;request:string;from_config:string;update_config:string;proof:string;public_origin:string;phase:Phase;lease:string|null;until:number;updated_at:number};
type Provider={prepare(config:ProvisionConfig):Promise<ActivationReceipt>;apply(config:ProvisionConfig):Promise<ActivationReceipt>;status(config:ProvisionConfig):Promise<ActivationReceipt>};
type Verifier={nip05(input:{publicOrigin:string;domain:string;localPart:string;brandPubkey:string}):Promise<unknown>;lnurl(input:{publicOrigin:string;domain:string;localPart:string;brandPubkey:string}):Promise<unknown>};
class EvidenceChanged extends Error{}

const unchanged=["cityId","domain","localPart","brandPubkey","authorityEventId","approvalEventId","brandEventId","walletRef","organizerBasisPoints","retainedBasisPoints","invoiceIssuance"] as const satisfies readonly (keyof ProvisionConfig)[];

/** Durable payout-only configuration transition. The currently active config
 * remains authoritative until the new provider version and both public
 * endpoints have been independently read back. */
export class PayoutUpdateWorkflow{
 constructor(private db:DatabaseSync,private provider:Provider,private verify:Verifier,
  private resolve:(requestId:string,current:ProvisionConfig)=>Promise<PayoutUpdateEvidence>,private now=()=>Date.now()){
  db.exec(`CREATE TABLE IF NOT EXISTS rustress_payout_update_task(
   city TEXT NOT NULL,payout_version INTEGER NOT NULL,request TEXT NOT NULL,from_config TEXT NOT NULL,update_config TEXT NOT NULL,
   proof TEXT NOT NULL,public_origin TEXT NOT NULL,phase TEXT NOT NULL,lease TEXT,until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,
   PRIMARY KEY(city,payout_version));`);
 }
 private row(city:string,payoutVersion?:number){return (payoutVersion===undefined?
  this.db.prepare("SELECT * FROM rustress_payout_update_task WHERE city=? ORDER BY payout_version DESC LIMIT 1").get(city):
  this.db.prepare("SELECT * FROM rustress_payout_update_task WHERE city=? AND payout_version=?").get(city,payoutVersion)) as Row|undefined;}
 status(city:string){const row=this.row(city);return row?{cityId:city,payoutVersion:row.payout_version,state:row.phase,updatedAt:row.updated_at}:null;}
 pendingCities(){return (this.db.prepare("SELECT city FROM rustress_payout_update_task WHERE phase NOT IN ('active','blocked') GROUP BY city ORDER BY MIN(updated_at),city LIMIT 10").all() as {city:string}[]).map(row=>row.city);}
 async retry(city:string){const row=this.row(city);if(!row||row.phase==="active")return this.status(city);this.db.prepare("UPDATE rustress_payout_update_task SET phase='unknown',lease=NULL,until=0,updated_at=? WHERE city=? AND payout_version=?").run(this.now(),city,row.payout_version);return this.run(city);}
 async enqueue(requestId:string){
  const active=this.db.prepare("SELECT request,activation_config,phase FROM rustress_activation_task WHERE city=(SELECT city_id FROM city_brand_request WHERE id=?)").get(requestId) as {request:string;activation_config:string;phase:string}|undefined;
  if(!active||active.request!==requestId||active.phase!=="active")throw new Error("An active city payment configuration is required before changing its payout destination.");
  const current=managedProvisionConfigSchema.parse(JSON.parse(active.activation_config));
  const evidence=await this.resolve(requestId,current),next=managedProvisionConfigSchema.parse(evidence.config);
  if(!/^[0-9a-f]{64}$/.test(evidence.proofHash)||next.version!==current.version+1||next.payoutVersion<=current.payoutVersion||
   unchanged.some(field=>next[field]!==current[field]))throw new Error("Payout update evidence requires review.");
  const origin=new URL(evidence.publicOrigin);if(origin.protocol!=="https:"||origin.origin!==evidence.publicOrigin||origin.hostname!==next.domain)throw new Error("Canonical public payout-update origin required.");
  const from=JSON.stringify(current),update=JSON.stringify(next),now=this.now();this.db.exec("BEGIN IMMEDIATE");
  try{const latest=this.row(next.cityId);if(latest&&latest.phase!=="active"&&latest.payout_version!==next.payoutVersion)throw new Error("A prior payout update still requires review.");
   const exact=this.row(next.cityId,next.payoutVersion);if(exact&&(exact.request!==requestId||exact.from_config!==from||exact.update_config!==update||exact.proof!==evidence.proofHash||exact.public_origin!==origin.origin))throw new Error("Existing payout update requires review; no configuration was replaced.");
   if(!exact)this.db.prepare("INSERT INTO rustress_payout_update_task VALUES(?,?,?,?,?,?,?,'queued',NULL,0,?)").run(next.cityId,next.payoutVersion,requestId,from,update,evidence.proofHash,origin.origin,now);
   this.db.exec("COMMIT");return this.status(next.cityId);
  }catch(error){this.db.exec("ROLLBACK");throw error;}
 }
 async run(cityId:string){const initial=this.row(cityId);if(!initial||initial.phase==="active"||initial.phase==="blocked")return this.status(cityId);
  const lease=randomUUID(),now=this.now(),claim=this.db.prepare("UPDATE rustress_payout_update_task SET lease=?,until=? WHERE city=? AND payout_version=? AND (lease IS NULL OR until<=?)").run(lease,now+120_000,cityId,initial.payout_version,now);if(!claim.changes)return this.status(cityId);
  const current=JSON.parse(initial.from_config) as ProvisionConfig,next=JSON.parse(initial.update_config) as ProvisionConfig;
  const set=(phase:Phase)=>{const result=this.db.prepare("UPDATE rustress_payout_update_task SET phase=?,updated_at=? WHERE city=? AND payout_version=? AND lease=? AND until>?").run(phase,this.now(),cityId,initial.payout_version,lease,this.now());if(!result.changes)throw new Error("Payout update worker lease expired.");};
  const exact=(receipt:ActivationReceipt)=>{const value=activationReceiptSchema.parse(receipt);if(value.cityId!==cityId||value.version!==next.version||value.configHash!==provisionDigest(next))throw new Error("Payout update read-back mismatch.");return value;};
  const fresh=async()=>{const evidence=await this.resolve(initial.request,current);if(JSON.stringify(evidence.config)!==initial.update_config||evidence.proofHash!==initial.proof||evidence.publicOrigin!==initial.public_origin)throw new EvidenceChanged();return evidence;};
  try{await fresh();let phase=this.row(cityId,initial.payout_version)!.phase;
   if(["preparing","applying","unknown","verifying","needs-attention"].includes(phase)){set("unknown");try{const receipt=exact(await this.provider.status(next));phase=receipt.state==="applied"?"verifying":"prepared";}catch(error){if(!(error instanceof ProvisioningError&&error.outcome==="absent"))throw error;phase="queued";}set(phase);}
   if(phase==="queued"){set("preparing");exact(await this.provider.prepare(next));const receipt=exact(await this.provider.status(next));await fresh();phase=receipt.state==="applied"?"verifying":"prepared";set(phase);}
   if(phase==="prepared"){await fresh();set("applying");exact(await this.provider.apply(next));const receipt=exact(await this.provider.status(next));if(receipt.state!=="applied")throw new Error("Payout update is not independently confirmed.");await fresh();phase="verifying";set(phase);}
   if(phase==="verifying"){const evidence=await fresh(),input={publicOrigin:evidence.publicOrigin,domain:next.domain,localPart:next.localPart,brandPubkey:next.brandPubkey};await this.verify.nip05(input);await this.verify.lnurl(input);await fresh();
    this.db.exec("BEGIN IMMEDIATE");try{const active=this.db.prepare("SELECT activation_config,phase FROM rustress_activation_task WHERE city=?").get(cityId) as {activation_config:string;phase:string}|undefined;if(!active||active.phase!=="active"||active.activation_config!==initial.from_config)throw new EvidenceChanged();
     const predecessor=JSON.stringify({...next,version:next.version-1,invoiceIssuance:"disabled"});
     this.db.prepare("UPDATE rustress_activation_task SET reserved_config=?,activation_config=?,updated_at=? WHERE city=?").run(predecessor,initial.update_config,this.now(),cityId);
     this.db.prepare("UPDATE rustress_payout_update_task SET phase='active',updated_at=? WHERE city=? AND payout_version=? AND lease=?").run(this.now(),cityId,initial.payout_version,lease);this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}}
  }catch(error){const phase=error instanceof EvidenceChanged||error instanceof ProvisioningError&&error.outcome==="rejected"?"blocked":error instanceof PublicProvisioningError?"needs-attention":"unknown";this.db.prepare("UPDATE rustress_payout_update_task SET phase=?,updated_at=? WHERE city=? AND payout_version=? AND lease=?").run(phase,this.now(),cityId,initial.payout_version,lease);}
  finally{this.db.prepare("UPDATE rustress_payout_update_task SET lease=NULL,until=0 WHERE city=? AND payout_version=? AND lease=?").run(cityId,initial.payout_version,lease);}return this.status(cityId);
 }
}
