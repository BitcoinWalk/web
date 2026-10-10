import {createHash,randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {MADEIRA_PILOT} from "../nostr/madeira-pilot";
import {MADEIRA_MANAGED_ACTIVATION,madeiraManagedActivationChallengeSchema,verifyMadeiraManagedActivationProof,
  type MadeiraManagedActivationChallenge,type MadeiraManagedActivationRole} from "../nostr/madeira-managed-activation";
import {createCityActivation,verifyCityActivation} from "./activation-contract";
import {provisionConfigSchema,type ProvisionConfig} from "./contract";
import type {ActivationEvidence} from "./activation-workflow";

type Source={requestId:string;reserved:ProvisionConfig;proofHash:string};
type Row={id:string;challenge:string;owner:string|null;admin:string|null};

/** Private, staging-only consent for the exact disabled -> enabled Madeira
 * transition. It is separate from reservation consent and is never published. */
export class MadeiraManagedActivationStore{
  constructor(private db:DatabaseSync,private source:()=>Promise<Source>,private revision:string,
    private now=()=>Math.floor(Date.now()/1000)){
    db.exec("CREATE TABLE IF NOT EXISTS madeira_managed_activation (singleton INTEGER PRIMARY KEY CHECK(singleton=1),id TEXT NOT NULL UNIQUE,challenge TEXT NOT NULL,owner TEXT,admin TEXT)");
  }
  private row(){return this.db.prepare("SELECT id,challenge,owner,admin FROM madeira_managed_activation WHERE singleton=1").get() as Row|undefined;}
  private checked(row:Row){return madeiraManagedActivationChallengeSchema.parse(JSON.parse(row.challenge));}
  private async current(){
    const source=await this.source(),reserved=provisionConfigSchema.parse(source.reserved),activation=createCityActivation(reserved);
    if(reserved.cityId!==MADEIRA_PILOT.cityId||reserved.brandPubkey!==MADEIRA_PILOT.pubkey)throw new Error("Madeira reservation identity changed; activation blocked.");
    return {...source,reserved,activation};
  }
  async prepare(){
    const source=await this.current();this.db.exec("BEGIN IMMEDIATE");
    try{
      const row=this.row();
      if(row){const challenge=this.checked(row);if(challenge.providerRevision!==this.revision||challenge.reservationRequestId!==source.requestId||challenge.reservationProofHash!==source.proofHash||
        JSON.stringify(challenge.reserved)!==JSON.stringify(source.reserved)||JSON.stringify(challenge.activation)!==JSON.stringify(source.activation))
        throw new Error("Madeira public activation evidence changed; review required.");
        if(row.admin||challenge.expiresAt>this.now()){this.db.exec("COMMIT");return this.view();}}
      const issuedAt=this.now(),challenge:MadeiraManagedActivationChallenge={scope:MADEIRA_MANAGED_ACTIVATION,cityId:MADEIRA_PILOT.cityId,pubkey:MADEIRA_PILOT.pubkey,
        origin:MADEIRA_PILOT.origin,publicOrigin:"https://bitcoinwalk.org",requestId:randomUUID(),reservationRequestId:source.requestId,reservationProofHash:source.proofHash,
        issuedAt,expiresAt:issuedAt+3600,providerRevision:this.revision,nip05:"madeira@bitcoinwalk.org",lightningAddress:"madeira@bitcoinwalk.org",
        publicActivation:true,organizerBasisPoints:7900,retainedBasisPoints:2100,reserved:source.reserved,activation:source.activation};
      this.db.prepare("INSERT INTO madeira_managed_activation VALUES(1,?,?,NULL,NULL) ON CONFLICT(singleton) DO UPDATE SET id=excluded.id,challenge=excluded.challenge,owner=NULL,admin=NULL")
        .run(challenge.requestId,JSON.stringify(challenge));this.db.exec("COMMIT");return this.view();
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  view(){const row=this.row();return row?{challenge:this.checked(row),ownerConfirmed:!!row.owner,adminConfirmed:!!row.admin}:null;}
  async accept(role:MadeiraManagedActivationRole,event:Event){
    const row=this.row();if(!row)throw new Error("Load the managed public activation request first.");const challenge=this.checked(row),source=await this.current();
    if(challenge.providerRevision!==this.revision||challenge.reservationRequestId!==source.requestId||challenge.reservationProofHash!==source.proofHash||
      JSON.stringify(challenge.reserved)!==JSON.stringify(source.reserved)||JSON.stringify(challenge.activation)!==JSON.stringify(source.activation))
      throw new Error("Madeira public activation evidence changed; no proof saved.");
    verifyMadeiraManagedActivationProof(event,challenge,role,this.now());
    if(role==="admin"){if(!row.owner)throw new Error("Madeira account must authorize public activation first.");
      verifyMadeiraManagedActivationProof(JSON.parse(row.owner),challenge,"owner",this.now(),true);}
    const prior=role==="owner"?row.owner:row.admin;if(prior&&JSON.parse(prior).id!==event.id)throw new Error("Existing managed public activation proof cannot be replaced.");
    if(!this.db.prepare(`UPDATE madeira_managed_activation SET ${role}=? WHERE singleton=1 AND id=? AND challenge=?`).run(JSON.stringify(event),row.id,row.challenge).changes)
      throw new Error("Managed public activation request changed; reload.");
    return this.view();
  }
  async evidence(requestId:string):Promise<ActivationEvidence>{
    const row=this.row();if(!row||row.id!==requestId||!row.owner||!row.admin)throw new Error("Both managed public activation proofs are required.");
    const challenge=this.checked(row),source=await this.current();
    verifyMadeiraManagedActivationProof(JSON.parse(row.owner),challenge,"owner",this.now(),true);
    verifyMadeiraManagedActivationProof(JSON.parse(row.admin),challenge,"admin",this.now(),true);
    if(challenge.providerRevision!==this.revision||challenge.reservationRequestId!==source.requestId||challenge.reservationProofHash!==source.proofHash||
      JSON.stringify(challenge.reserved)!==JSON.stringify(source.reserved)||JSON.stringify(challenge.activation)!==JSON.stringify(source.activation))
      throw new Error("Madeira public activation evidence changed; activation blocked.");
    return {reserved:source.reserved,activation:verifyCityActivation(source.reserved,source.activation),publicOrigin:challenge.publicOrigin,
      proofHash:createHash("sha256").update(row.challenge+row.owner+row.admin+source.proofHash).digest("hex")};
  }
}
