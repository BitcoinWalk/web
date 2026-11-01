import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {ProvisioningError} from "./client";
import {activationReceiptSchema,managedProvisionConfigSchema,provisionDigest,type ActivationReceipt,type ProvisionConfig} from "./contract";
import {PublicProvisioningError} from "./public-provisioning";

export type AuthorityRefreshEvidence={config:ProvisionConfig;proofHash:string;publicOrigin:string};
type Phase="queued"|"preparing"|"prepared"|"applying"|"verifying"|"unknown"|"needs-attention"|"active"|"blocked";
type Row={city:string;target_version:number;from_config:string;update_config:string;proof:string;public_origin:string;phase:Phase;lease:string|null;until:number;updated_at:number};
type Provider={prepare(config:ProvisionConfig):Promise<ActivationReceipt>;apply(config:ProvisionConfig):Promise<ActivationReceipt>;status(config:ProvisionConfig):Promise<ActivationReceipt>};
type Verifier={nip05(input:{publicOrigin:string;domain:string;localPart:string;brandPubkey:string}):Promise<unknown>;lnurl(input:{publicOrigin:string;domain:string;localPart:string;brandPubkey:string}):Promise<unknown>};
class EvidenceChanged extends Error{}
const same=["cityId","domain","localPart","brandPubkey","brandEventId","payoutVersion","payoutDestination","walletRef","organizerBasisPoints","retainedBasisPoints","invoiceIssuance"] as const satisfies readonly (keyof ProvisionConfig)[];

/** Refreshes only the administrative authority behind an already applied city
 * configuration. Identity, payout destination/version and split cannot move. */
export class AuthorityRefreshWorkflow{
 constructor(private db:DatabaseSync,private provider:Provider,private verify:Verifier,private resolve:(cityId:string,current:ProvisionConfig)=>Promise<AuthorityRefreshEvidence>,private now=()=>Date.now()){
  db.exec(`CREATE TABLE IF NOT EXISTS rustress_authority_refresh_task(city TEXT PRIMARY KEY,target_version INTEGER NOT NULL,from_config TEXT NOT NULL,update_config TEXT NOT NULL,
   proof TEXT NOT NULL,public_origin TEXT NOT NULL,phase TEXT NOT NULL,lease TEXT,until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);`);
 }
 private row(city:string){return this.db.prepare("SELECT * FROM rustress_authority_refresh_task WHERE city=?").get(city) as Row|undefined;}
 status(city:string){const row=this.row(city);return row?{cityId:city,targetVersion:row.target_version,state:row.phase,updatedAt:row.updated_at}:null;}
 async enqueue(city:string){
  const active=this.db.prepare("SELECT activation_config,phase,nip05,lnurl FROM rustress_activation_task WHERE city=?").get(city) as {activation_config:string;phase:string;nip05:string;lnurl:string}|undefined;
  if(!active||!['active','unknown'].includes(active.phase)||active.nip05!=="active"||active.lnurl!=="active")throw new Error("An exact publicly verified city configuration is required.");
  const current=managedProvisionConfigSchema.parse(JSON.parse(active.activation_config)),evidence=await this.resolve(city,current),next=managedProvisionConfigSchema.parse(evidence.config);
  if(!/^[0-9a-f]{64}$/.test(evidence.proofHash)||next.version!==current.version+1||same.some(field=>next[field]!==current[field])||
   next.authorityEventId===current.authorityEventId&&next.approvalEventId===current.approvalEventId)throw new Error("Authority refresh evidence requires review.");
  const origin=new URL(evidence.publicOrigin);if(origin.protocol!=="https:"||origin.origin!==evidence.publicOrigin||origin.hostname!==next.domain)throw new Error("Canonical authority-refresh origin required.");
  const from=JSON.stringify(current),update=JSON.stringify(next),old=this.row(city),now=this.now();
  if(old&&(old.from_config!==from||old.update_config!==update||old.proof!==evidence.proofHash||old.public_origin!==origin.origin))throw new Error("Existing authority refresh requires review.");
  if(!old)this.db.prepare("INSERT INTO rustress_authority_refresh_task VALUES(?,?,?,?,?,?,'queued',NULL,0,?)").run(city,next.version,from,update,evidence.proofHash,origin.origin,now);
  return this.status(city);
 }
 async run(city:string){const initial=this.row(city);if(!initial||initial.phase==="active"||initial.phase==="blocked")return this.status(city);
  const lease=randomUUID(),now=this.now(),claim=this.db.prepare("UPDATE rustress_authority_refresh_task SET lease=?,until=? WHERE city=? AND (lease IS NULL OR until<=?)").run(lease,now+120_000,city,now);if(!claim.changes)return this.status(city);
  const current=managedProvisionConfigSchema.parse(JSON.parse(initial.from_config)),next=managedProvisionConfigSchema.parse(JSON.parse(initial.update_config));
  const set=(phase:Phase)=>{const changed=this.db.prepare("UPDATE rustress_authority_refresh_task SET phase=?,updated_at=? WHERE city=? AND lease=? AND until>?").run(phase,this.now(),city,lease,this.now());if(!changed.changes)throw new Error("Authority refresh lease expired.");};
  const exact=(receipt:ActivationReceipt,config:ProvisionConfig)=>{const value=activationReceiptSchema.parse(receipt);if(value.cityId!==city||value.version!==config.version||value.configHash!==provisionDigest(config))throw new Error("Authority refresh read-back mismatch.");return value;};
  const fresh=async()=>{const evidence=await this.resolve(city,current);if(JSON.stringify(evidence.config)!==initial.update_config||evidence.proofHash!==initial.proof||evidence.publicOrigin!==initial.public_origin)throw new EvidenceChanged();return evidence;};
  try{await fresh();let phase=this.row(city)!.phase;
   if(["preparing","applying","unknown","verifying","needs-attention"].includes(phase)){set("unknown");try{const receipt=exact(await this.provider.status(next),next);phase=receipt.state==="applied"?"verifying":"prepared";}catch(error){if(!(error instanceof ProvisioningError&&error.outcome==="absent"))throw error;phase="queued";}set(phase);}
   if(phase==="queued"){const predecessor=exact(await this.provider.status(current),current);if(predecessor.state!=="applied")throw new Error("Current city configuration is not applied.");set("preparing");exact(await this.provider.prepare(next),next);const receipt=exact(await this.provider.status(next),next);await fresh();phase=receipt.state==="applied"?"verifying":"prepared";set(phase);}
   if(phase==="prepared"){await fresh();set("applying");exact(await this.provider.apply(next),next);const receipt=exact(await this.provider.status(next),next);if(receipt.state!=="applied")throw new Error("Authority refresh is not independently confirmed.");await fresh();phase="verifying";set(phase);}
   if(phase==="verifying"){const evidence=await fresh(),input={publicOrigin:evidence.publicOrigin,domain:next.domain,localPart:next.localPart,brandPubkey:next.brandPubkey};await this.verify.nip05(input);await this.verify.lnurl(input);await fresh();
    this.db.exec("BEGIN IMMEDIATE");try{const active=this.db.prepare("SELECT activation_config FROM rustress_activation_task WHERE city=?").get(city) as {activation_config:string}|undefined;if(!active||active.activation_config!==initial.from_config)throw new EvidenceChanged();
     this.db.prepare("UPDATE rustress_activation_task SET reserved_config=?,activation_config=?,phase='active',nip05='active',lnurl='active',updated_at=? WHERE city=?").run(JSON.stringify({...next,version:next.version-1,invoiceIssuance:"disabled"}),initial.update_config,this.now(),city);
     this.db.prepare("UPDATE rustress_authority_refresh_task SET phase='active',updated_at=? WHERE city=? AND lease=?").run(this.now(),city,lease);this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}}
  }catch(error){const phase=error instanceof EvidenceChanged||error instanceof ProvisioningError&&error.outcome==="rejected"?"blocked":error instanceof PublicProvisioningError?"needs-attention":"unknown";this.db.prepare("UPDATE rustress_authority_refresh_task SET phase=?,updated_at=? WHERE city=? AND lease=?").run(phase,this.now(),city,lease);}
  finally{this.db.prepare("UPDATE rustress_authority_refresh_task SET lease=NULL,until=0 WHERE city=? AND lease=?").run(city,lease);}return this.status(city);
 }
}
