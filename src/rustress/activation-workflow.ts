import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {verifyCityActivation} from "./activation-contract";
import {ProvisioningError} from "./client";
import {activationReceiptSchema, provisionDigest, provisionReceiptSchema, type ActivationReceipt,
  type ProvisionConfig, type ProvisionReceipt} from "./contract";
import {PublicProvisioningError} from "./public-provisioning";

export type ActivationEvidence = {reserved: ProvisionConfig; activation: ProvisionConfig; proofHash: string; publicOrigin: string};
type Phase = "queued"|"preparing"|"prepared"|"applying"|"verifying"|"unknown"|"needs-attention"|"active"|"blocked";
type Check = "setup-required"|"provisioning"|"active"|"needs-attention";
type Row = {city:string;request:string;reserved_config:string;activation_config:string;proof:string;public_origin:string;
  phase:Phase;nip05:Check;lnurl:Check;lease:string|null;until:number;updated_at:number};
type ReservationProvider = {status(config:ProvisionConfig):Promise<ProvisionReceipt>};
type ActivationProvider = {prepare(config:ProvisionConfig):Promise<ActivationReceipt>;apply(config:ProvisionConfig):Promise<ActivationReceipt>;
  status(config:ProvisionConfig):Promise<ActivationReceipt>};
type PublicVerifier = {nip05(input:{publicOrigin:string;domain:string;localPart:string;brandPubkey:string}):Promise<unknown>;
  lnurl(input:{publicOrigin:string;domain:string;localPart:string;brandPubkey:string}):Promise<unknown>};
class AuthorityChanged extends Error {}

/** Durable activation outbox. Provider writes and public verification are
 * recoverable, separately read back and always preceded by fresh evidence. */
export class ActivationWorkflow {
  constructor(private db:DatabaseSync,private reservation:ReservationProvider,private activation:ActivationProvider,
    private verify:PublicVerifier,private resolve:(requestId:string,current?:ProvisionConfig)=>Promise<ActivationEvidence>,private now=()=>Date.now()){
    db.exec(`CREATE TABLE IF NOT EXISTS rustress_activation_task (
      city TEXT PRIMARY KEY,request TEXT NOT NULL UNIQUE,reserved_config TEXT NOT NULL,activation_config TEXT NOT NULL,
      proof TEXT NOT NULL,public_origin TEXT NOT NULL,phase TEXT NOT NULL,nip05 TEXT NOT NULL,lnurl TEXT NOT NULL,
      lease TEXT,until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);`);
  }
  private row(city:string){return this.db.prepare("SELECT * FROM rustress_activation_task WHERE city=?").get(city) as Row|undefined;}
  status(city:string){const row=this.row(city);return row?{cityId:city,state:row.phase,nip05:row.nip05,lnurl:row.lnurl,updatedAt:row.updated_at}:null;}
  pendingCities(){return (this.db.prepare("SELECT city FROM rustress_activation_task WHERE phase NOT IN ('active','blocked') ORDER BY updated_at,city LIMIT 10").all() as {city:string}[]).map(row=>row.city);}
  async enqueue(requestId:string){
    const evidence=await this.resolve(requestId),activation=verifyCityActivation(evidence.reserved,evidence.activation);
    if(!/^[0-9a-f]{64}$/.test(evidence.proofHash))throw new Error("Activation evidence requires review.");
    const origin=new URL(evidence.publicOrigin);
    if(origin.protocol!=="https:"||origin.origin!==evidence.publicOrigin||origin.hostname!==activation.domain)throw new Error("Canonical public activation origin required.");
    const reserved=JSON.stringify(evidence.reserved),enabled=JSON.stringify(activation),now=this.now();
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const row=this.row(activation.cityId);
      if(row&&(row.request!==requestId||row.reserved_config!==reserved||row.activation_config!==enabled||row.proof!==evidence.proofHash||row.public_origin!==origin.origin))
        throw new Error("Existing activation task requires review; no configuration was replaced.");
      if(!row)this.db.prepare("INSERT INTO rustress_activation_task(city,request,reserved_config,activation_config,proof,public_origin,phase,nip05,lnurl,updated_at) VALUES(?,?,?,?,?,?,'queued','provisioning','provisioning',?)")
        .run(activation.cityId,requestId,reserved,enabled,evidence.proofHash,origin.origin,now);
      this.db.exec("COMMIT");return this.status(activation.cityId);
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  async run(cityId:string){
    const lease=randomUUID(),now=this.now(),claim=this.db.prepare("UPDATE rustress_activation_task SET lease=?,until=? WHERE city=? AND (lease IS NULL OR until<=?)")
      .run(lease,now+120_000,cityId,now);
    if(!claim.changes)return this.status(cityId);
    const initial=this.row(cityId)!;
    const set=(phase:Phase,nip05?:Check,lnurl?:Check)=>{
      const result=this.db.prepare("UPDATE rustress_activation_task SET phase=?,nip05=COALESCE(?,nip05),lnurl=COALESCE(?,lnurl),updated_at=? WHERE city=? AND lease=? AND until>?")
        .run(phase,nip05??null,lnurl??null,this.now(),cityId,lease,this.now());
      if(!result.changes)throw new Error("Activation worker lease expired.");
    };
    const fresh=async()=>{
      const stored=JSON.parse(initial.activation_config) as ProvisionConfig;
      const evidence=await this.resolve(initial.request,stored),activation=verifyCityActivation(evidence.reserved,evidence.activation);
      if(JSON.stringify(evidence.reserved)!==initial.reserved_config||JSON.stringify(activation)!==initial.activation_config||
        (initial.phase!=="active"&&evidence.proofHash!==initial.proof)||evidence.publicOrigin!==initial.public_origin)throw new AuthorityChanged();
      const current=this.row(cityId);if(current?.lease!==lease||current.until<=this.now())throw new Error("Activation worker lease expired.");
      return evidence;
    };
    const reserved=JSON.parse(initial.reserved_config) as ProvisionConfig,active=JSON.parse(initial.activation_config) as ProvisionConfig;
    const exactReserved=(receipt:ProvisionReceipt)=>{const value=provisionReceiptSchema.parse(receipt);if(value.state!=="applied"||value.cityId!==cityId||value.version!==reserved.version||
      value.configHash!==provisionDigest(reserved))throw new Error("Disabled reservation read-back mismatch.");return value;};
    const exactActive=(receipt:ActivationReceipt)=>{const value=activationReceiptSchema.parse(receipt);if(value.cityId!==cityId||value.version!==active.version||
      value.configHash!==provisionDigest(active))throw new Error("Activation read-back mismatch.");return value;};
    try{
      if(initial.phase==="blocked")return this.status(cityId);
      await fresh();let phase=this.row(cityId)!.phase;
      if(["preparing","applying","unknown","verifying","needs-attention","active"].includes(phase)){
        set("unknown");const receipt=exactActive(await this.activation.status(active));await fresh();
        phase=receipt.state==="applied"?"verifying":"prepared";set(phase);
      }
      // Once the provider has durably advanced to the exact applied v2
      // configuration, its v1 endpoint is intentionally no longer current.
      // The initial transition still requires an exact applied v1 read-back.
      if(phase!=="verifying"){exactReserved(await this.reservation.status(reserved));await fresh();}
      if(phase==="queued"){
        set("preparing");exactActive(await this.activation.prepare(active));const receipt=exactActive(await this.activation.status(active));await fresh();
        phase=receipt.state==="applied"?"verifying":"prepared";set(phase);
      }
      if(phase==="prepared"){
        await fresh();set("applying");exactActive(await this.activation.apply(active));
        const receipt=exactActive(await this.activation.status(active));if(receipt.state!=="applied")throw new Error("Activation is not independently confirmed.");
        await fresh();set("verifying");phase="verifying";
      }
      if(phase==="verifying"){
        const evidence=await fresh(),input={publicOrigin:evidence.publicOrigin,domain:active.domain,localPart:active.localPart,brandPubkey:active.brandPubkey};
        let nip05:Check="active",lnurl:Check="active";
        try{await this.verify.nip05(input);}catch{nip05="needs-attention";}
        try{await this.verify.lnurl(input);}catch{lnurl="needs-attention";}
        await fresh();set(nip05==="active"&&lnurl==="active"?"active":"needs-attention",nip05,lnurl);
      }
    }catch(error){
      const phase=error instanceof AuthorityChanged||error instanceof ProvisioningError&&error.outcome==="rejected"?"blocked":
        error instanceof PublicProvisioningError?"needs-attention":"unknown";
      this.db.prepare("UPDATE rustress_activation_task SET phase=?,nip05=CASE WHEN ?='blocked' THEN 'needs-attention' ELSE nip05 END,lnurl=CASE WHEN ?='blocked' THEN 'needs-attention' ELSE lnurl END,updated_at=? WHERE city=? AND lease=? AND until>?")
        .run(phase,phase,phase,this.now(),cityId,lease,this.now());
    }finally{this.db.prepare("UPDATE rustress_activation_task SET lease=NULL,until=0 WHERE city=? AND lease=?").run(cityId,lease);}
    return this.status(cityId);
  }
}
