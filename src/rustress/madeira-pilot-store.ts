import {createHash, randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {MADEIRA_PILOT, madeiraChallengeSchema, madeiraSnapshotSchema, verifyMadeiraProof,
  type MadeiraChallenge, type MadeiraSnapshot, type MadeiraRole} from "../nostr/madeira-pilot";
import type {ProvisionEvidence} from "./workflow";

type Row = {id: string; challenge: string; owner: string | null; admin: string | null};
/** Entirely separate from paid_city_entitlement and ordinary brand bindings.
 * The admin signature grants only this private fixture rehearsal. */
export class MadeiraPilotStore {
  constructor(private db: DatabaseSync, private snapshot: () => Promise<MadeiraSnapshot>, private now = () => Math.floor(Date.now()/1000)) {
    db.exec("CREATE TABLE IF NOT EXISTS madeira_private_pilot (singleton INTEGER PRIMARY KEY CHECK(singleton=1),id TEXT NOT NULL UNIQUE,challenge TEXT NOT NULL,owner TEXT,admin TEXT)");
  }
  private row() {return this.db.prepare("SELECT id,challenge,owner,admin FROM madeira_private_pilot WHERE singleton=1").get() as Row|undefined;}
  private checked(row: Row) {return madeiraChallengeSchema.parse(JSON.parse(row.challenge));}
  async prepare() {
    const snapshot = madeiraSnapshotSchema.parse(await this.snapshot());
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.row();
      if (row) {
        const challenge = this.checked(row);
        if (JSON.stringify(snapshot)!==JSON.stringify(challenge.snapshot)) throw new Error("Madeira approval or payout changed; pilot review required.");
        if (row.admin || challenge.expiresAt>this.now()) {this.db.exec("COMMIT");return this.view();}
      }
      const now=this.now();
      const challenge: MadeiraChallenge = {...MADEIRA_PILOT, requestId:randomUUID(), issuedAt:now, expiresAt:now+3600,
        entitlement:"staging-test-only-unpaid",invoiceIssuance:"disabled",snapshot};
      this.db.prepare("INSERT INTO madeira_private_pilot VALUES(1,?,?,NULL,NULL) ON CONFLICT(singleton) DO UPDATE SET id=excluded.id,challenge=excluded.challenge,owner=NULL,admin=NULL").run(challenge.requestId,JSON.stringify(challenge));
      this.db.exec("COMMIT");return this.view();
    } catch(error) {this.db.exec("ROLLBACK");throw error;}
  }
  view() {
    const row=this.row();
    return row?{challenge:this.checked(row),ownerConfirmed:!!row.owner,adminConfirmed:!!row.admin,
      entitlement:row.admin?"staging-test-only-unpaid":"awaiting-signatures"}:null;
  }
  async accept(role: MadeiraRole, event: Event) {
    const row=this.row();if(!row)throw new Error("Load the pilot request first.");
    const challenge=this.checked(row);
    if(JSON.stringify(madeiraSnapshotSchema.parse(await this.snapshot()))!==JSON.stringify(challenge.snapshot))throw new Error("Madeira evidence changed; no proof saved.");
    verifyMadeiraProof(event,challenge,role,this.now());
    if(role==="admin"){
      if(!row.owner)throw new Error("Madeira account must confirm first.");
      verifyMadeiraProof(JSON.parse(row.owner),challenge,"owner",this.now(),true);
    }
    const prior=role==="owner"?row.owner:row.admin;
    if(prior && JSON.parse(prior).id!==event.id)throw new Error("Existing proof cannot be replaced.");
    if(!this.db.prepare(`UPDATE madeira_private_pilot SET ${role}=? WHERE singleton=1 AND id=? AND challenge=?`)
      .run(JSON.stringify(event),row.id,row.challenge).changes)throw new Error("Pilot request changed; reload.");
    return this.view();
  }
  async evidence(requestId: string): Promise<ProvisionEvidence> {
    const row=this.row();if(!row||row.id!==requestId||!row.owner||!row.admin)throw new Error("Both private pilot proofs are required.");
    const challenge=this.checked(row);
    verifyMadeiraProof(JSON.parse(row.owner),challenge,"owner",this.now(),true);
    const admin=verifyMadeiraProof(JSON.parse(row.admin),challenge,"admin",this.now(),true);
    if(JSON.stringify(madeiraSnapshotSchema.parse(await this.snapshot()))!==JSON.stringify(challenge.snapshot))throw new Error("Madeira approval or payout changed; pilot blocked.");
    const s=challenge.snapshot;
    return {config:{cityId:MADEIRA_PILOT.cityId,version:1,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:MADEIRA_PILOT.pubkey,
      authorityEventId:s.authorityEventId,approvalEventId:s.approvalEventId,brandEventId:admin.id,payoutVersion:s.payoutVersion,
      payoutDestination:s.payoutDestination,walletRef:"isolated-test",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"disabled"},
      proofHash:createHash("sha256").update(row.challenge+row.owner+row.admin).digest("hex")};
  }
}
