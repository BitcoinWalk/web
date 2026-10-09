import {createHash,randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {MADEIRA_PILOT,type MadeiraSnapshot} from "../nostr/madeira-pilot";
import {MADEIRA_MANAGED_RESERVATION,madeiraManagedChallengeSchema,managedSnapshot,verifyMadeiraManagedProof,
  type MadeiraManagedChallenge,type MadeiraManagedRole} from "../nostr/madeira-managed-pilot";
import type {ProvisionEvidence} from "./workflow";

type Row={id:string;challenge:string;owner:string|null;admin:string|null};
/** A separate, staging-only authorization for one disabled managed reservation.
 * It neither creates a paid entitlement nor authorizes public activation. */
export class MadeiraManagedPilotStore{
  constructor(private db:DatabaseSync,private snapshot:()=>Promise<MadeiraSnapshot>,private revision:string,private now=()=>Math.floor(Date.now()/1000)){
    db.exec("CREATE TABLE IF NOT EXISTS madeira_managed_pilot (singleton INTEGER PRIMARY KEY CHECK(singleton=1),id TEXT NOT NULL UNIQUE,challenge TEXT NOT NULL,owner TEXT,admin TEXT)");
  }
  private row(){return this.db.prepare("SELECT id,challenge,owner,admin FROM madeira_managed_pilot WHERE singleton=1").get() as Row|undefined;}
  private checked(row:Row){return madeiraManagedChallengeSchema.parse(JSON.parse(row.challenge));}
  async prepare(){
    const snapshot=managedSnapshot(await this.snapshot());this.db.exec("BEGIN IMMEDIATE");
    try{
      const row=this.row();
      if(row){const challenge=this.checked(row);if(JSON.stringify(snapshot)!==JSON.stringify(challenge.snapshot)||challenge.providerRevision!==this.revision)throw new Error("Madeira managed reservation evidence changed; review required.");if(row.admin||challenge.expiresAt>this.now()){this.db.exec("COMMIT");return this.view();}}
      const issuedAt=this.now(),challenge:MadeiraManagedChallenge={scope:MADEIRA_MANAGED_RESERVATION,cityId:MADEIRA_PILOT.cityId,pubkey:MADEIRA_PILOT.pubkey,
        origin:MADEIRA_PILOT.origin,requestId:randomUUID(),issuedAt,expiresAt:issuedAt+3600,providerRevision:this.revision,localPart:"madeira",walletRef:"bitcoinwalk-rustress",
        invoiceIssuance:"disabled",publicActivation:false,organizerBasisPoints:7900,retainedBasisPoints:2100,snapshot};
      this.db.prepare("INSERT INTO madeira_managed_pilot VALUES(1,?,?,NULL,NULL) ON CONFLICT(singleton) DO UPDATE SET id=excluded.id,challenge=excluded.challenge,owner=NULL,admin=NULL").run(challenge.requestId,JSON.stringify(challenge));
      this.db.exec("COMMIT");return this.view();
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  view(){const row=this.row();return row?{challenge:this.checked(row),ownerConfirmed:!!row.owner,adminConfirmed:!!row.admin}:null;}
  async accept(role:MadeiraManagedRole,event:Event){
    const row=this.row();if(!row)throw new Error("Load the managed reservation request first.");const challenge=this.checked(row);
    if(JSON.stringify(managedSnapshot(await this.snapshot()))!==JSON.stringify(challenge.snapshot)||challenge.providerRevision!==this.revision)throw new Error("Madeira managed reservation evidence changed; no proof saved.");
    verifyMadeiraManagedProof(event,challenge,role,this.now());
    if(role==="admin"){if(!row.owner)throw new Error("Madeira account must confirm managed reservation first.");verifyMadeiraManagedProof(JSON.parse(row.owner),challenge,"owner",this.now(),true);}
    const prior=role==="owner"?row.owner:row.admin;if(prior&&JSON.parse(prior).id!==event.id)throw new Error("Existing managed reservation proof cannot be replaced.");
    if(!this.db.prepare(`UPDATE madeira_managed_pilot SET ${role}=? WHERE singleton=1 AND id=? AND challenge=?`).run(JSON.stringify(event),row.id,row.challenge).changes)throw new Error("Managed reservation request changed; reload.");
    return this.view();
  }
  async evidence(requestId:string):Promise<ProvisionEvidence>{
    const row=this.row();if(!row||row.id!==requestId||!row.owner||!row.admin)throw new Error("Both managed reservation proofs are required.");const challenge=this.checked(row);
    verifyMadeiraManagedProof(JSON.parse(row.owner),challenge,"owner",this.now(),true);const admin=verifyMadeiraManagedProof(JSON.parse(row.admin),challenge,"admin",this.now(),true);
    if(JSON.stringify(managedSnapshot(await this.snapshot()))!==JSON.stringify(challenge.snapshot)||challenge.providerRevision!==this.revision)throw new Error("Madeira managed reservation evidence changed; provisioning blocked.");
    const s=challenge.snapshot;return {config:{cityId:MADEIRA_PILOT.cityId,version:1,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:MADEIRA_PILOT.pubkey,
      authorityEventId:s.authorityEventId,approvalEventId:s.approvalEventId,brandEventId:admin.id,payoutVersion:s.payoutVersion,payoutDestination:s.payoutDestination,
      walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"},
      proofHash:createHash("sha256").update(row.challenge+row.owner+row.admin).digest("hex")};
  }
}
