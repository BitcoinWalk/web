import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {authorizeCityBrand, createCityBrandChallenge, readCityBrand, resolveCityBrand,
  type CityBrandAuthority, type CityBrandChallenge, type CityBrandProfile} from "../nostr/city-brand";

type RequestRow = {id:string; city_id:string; challenge:string; status:string; expires_at:number; owner_proof:string|null; brand_proof:string|null; approved_event:string|null};
type PublicationRow = {request_id:string;event_id:string;verified_at:number;relays:string};

/** Private activation-evidence store. All authority inputs must come from fresh
 * verified server-side resolvers; only approved binding events have a public projection. */
export class CityBrandStore {
  constructor(private db: DatabaseSync, private now = () => Math.floor(Date.now() / 1000)) {
    db.exec(`CREATE TABLE IF NOT EXISTS city_brand_request (
      id TEXT PRIMARY KEY, city_id TEXT NOT NULL, challenge TEXT NOT NULL,
      status TEXT NOT NULL, expires_at INTEGER NOT NULL, owner_proof TEXT, brand_proof TEXT,
      approved_event TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS city_brand_pending ON city_brand_request(city_id) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS city_brand_binding (
      event_id TEXT PRIMARY KEY, city_id TEXT NOT NULL, sequence INTEGER NOT NULL, event TEXT NOT NULL,
      UNIQUE(city_id,sequence));
      CREATE TABLE IF NOT EXISTS city_brand_publication (
      request_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, verified_at INTEGER NOT NULL, relays TEXT NOT NULL);`);
  }
  private head(cityId: string) {
    const rows = this.db.prepare("SELECT event FROM city_brand_binding WHERE city_id=? ORDER BY sequence").all(cityId) as {event:string}[];
    return resolveCityBrand(rows.map(row => JSON.parse(row.event)), cityId)?.event ?? null;
  }
  private expire() {this.db.prepare("UPDATE city_brand_request SET status='expired' WHERE status='pending' AND expires_at<=?").run(this.now());}
  prepare(actor: string, authority: CityBrandAuthority, origin: string, brandPubkey: string, action: "activate" | "replace" | "revoke", profile: CityBrandProfile) {
    if (actor !== authority.ownerPubkey) throw new Error("Only the verified city owner may prepare this request.");
    const now = this.now();
    this.expire();
    const pending = this.db.prepare("SELECT * FROM city_brand_request WHERE city_id=? AND status='pending'").get(authority.cityId) as RequestRow | undefined;
    if (pending) {
      const existing = JSON.parse(pending.challenge) as CityBrandChallenge;
      if (existing.origin === origin && JSON.stringify(existing.authority) === JSON.stringify(authority) && existing.binding.brandPubkey === brandPubkey &&
          existing.binding.action === action && JSON.stringify(existing.profile) === JSON.stringify(profile)) return existing;
      throw new Error("A different city account request is already pending. Cancel it before preparing another.");
    }
    const challenge = createCityBrandChallenge({requestId: randomUUID(), authority, origin, brandPubkey, action, previous: this.head(authority.cityId), now, profile});
    this.db.prepare("INSERT INTO city_brand_request(id,city_id,challenge,status,expires_at) VALUES(?,?,?,'pending',?)")
      .run(challenge.requestId, authority.cityId, JSON.stringify(challenge), challenge.expiresAt);
    return challenge;
  }
  cancel(id: string, actor: string, authority: CityBrandAuthority) {
    const row = this.request(id);
    if (actor !== authority.ownerPubkey || row.city_id !== authority.cityId) throw new Error("Only the current city owner may cancel this request.");
    this.db.prepare("UPDATE city_brand_request SET status='cancelled' WHERE id=? AND status='pending'").run(id);
  }
  private request(id: string) {
    const row = this.db.prepare("SELECT * FROM city_brand_request WHERE id=?").get(id) as RequestRow | undefined;
    if (!row) throw new Error("City account request not found.");
    return row;
  }
  details(id: string) {const row = this.request(id); return {...row, challenge: JSON.parse(row.challenge) as CityBrandChallenge};}
  pending(limit = 100) {this.expire(); return (this.db.prepare("SELECT * FROM city_brand_request WHERE status='pending' ORDER BY expires_at LIMIT ?").all(limit) as RequestRow[])
    .map(row => ({...row, challenge: JSON.parse(row.challenge) as CityBrandChallenge}));}
  reviewQueue(limit=100){this.expire();return (this.db.prepare("SELECT * FROM city_brand_request WHERE status IN ('pending','approved') ORDER BY expires_at LIMIT ?").all(limit) as RequestRow[])
    .map(row=>({...row,challenge:JSON.parse(row.challenge) as CityBrandChallenge}));}
  pendingForCity(cityId:string){this.expire();const row=this.db.prepare("SELECT * FROM city_brand_request WHERE city_id=? AND status='pending'").get(cityId) as RequestRow|undefined;return row?{...row,challenge:JSON.parse(row.challenge) as CityBrandChallenge}:null;}
  submitProofs(id: string, actor: string, authority: CityBrandAuthority, ownerProof: Event, brandProof: Event) {
    const row = this.request(id);
    if (row.status !== "pending" || actor !== authority.ownerPubkey || row.city_id !== authority.cityId) throw new Error("Only the current city owner may submit this pending request.");
    authorizeCityBrand({challenge: JSON.parse(row.challenge), currentAuthority: authority, previous: this.head(row.city_id), ownerProof, brandProof, now: this.now()});
    this.db.prepare("UPDATE city_brand_request SET owner_proof=?,brand_proof=? WHERE id=? AND status='pending'").run(JSON.stringify(ownerProof), JSON.stringify(brandProof), id);
    return this.details(id);
  }
  reviewStored(id: string, actor: string, authority: CityBrandAuthority) {
    const row = this.request(id);
    if (!row.owner_proof || !row.brand_proof) throw new Error("Both organizer and city signer proofs are required.");
    return this.review(id, actor, authority, JSON.parse(row.owner_proof), JSON.parse(row.brand_proof));
  }
  approveStored(id: string, actor: string, authority: CityBrandAuthority, signed: Event) {
    const row = this.request(id);
    if (!row.owner_proof || !row.brand_proof) throw new Error("Both organizer and city signer proofs are required.");
    return this.approve(id, actor, authority, JSON.parse(row.owner_proof), JSON.parse(row.brand_proof), signed);
  }
  review(id: string, actor: string, authority: CityBrandAuthority, ownerProof: Event, brandProof?: Event) {
    if (actor !== SUPER_ADMIN_PUBKEY) throw new Error("Super-admin review required.");
    const row = this.request(id);
    if (row.status !== "pending") throw new Error("City account request is no longer pending.");
    return authorizeCityBrand({challenge: JSON.parse(row.challenge), currentAuthority: authority,
      previous: this.head(row.city_id), ownerProof, brandProof, now: this.now()});
  }
  approve(id: string, actor: string, authority: CityBrandAuthority, ownerProof: Event, brandProof: Event | undefined, signed: Event) {
    if (actor !== SUPER_ADMIN_PUBKEY) throw new Error("Super-admin review required.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.request(id);
      // Exact retries cannot revive an obsolete/revoked binding or mutate evidence.
      if (row.status === "approved" && row.approved_event === JSON.stringify(signed)) {
        readCityBrand(signed);
        if (this.head(row.city_id)?.id !== signed.id) throw new Error("Binding was superseded.");
        this.db.exec("COMMIT"); return signed;
      }
      const template = this.review(id, actor, authority, ownerProof, brandProof);
      const binding = readCityBrand(signed);
      if (signed.created_at !== template.created_at || signed.content !== template.content ||
          signed.kind !== template.kind || JSON.stringify(signed.tags) !== JSON.stringify(template.tags)) throw new Error("Approval changed the reviewed city account.");
      this.db.prepare("INSERT INTO city_brand_binding(event_id,city_id,sequence,event) VALUES(?,?,?,?)")
        .run(signed.id, binding.cityId, binding.sequence, JSON.stringify(signed));
      this.db.prepare("UPDATE city_brand_request SET status='approved',owner_proof=?,brand_proof=?,approved_event=? WHERE id=?")
        .run(JSON.stringify(ownerProof), brandProof ? JSON.stringify(brandProof) : null, JSON.stringify(signed), id);
      this.db.exec("COMMIT"); return signed;
    } catch (error) {this.db.exec("ROLLBACK"); throw error;}
  }
  /** The only public projection: no proof, personal owner or payout data. Local
   * approval alone is not activation; consumers must confirm relay read-back. */
  publicHistory(cityId: string): Event[] {
    const rows = this.db.prepare("SELECT event FROM city_brand_binding WHERE city_id=? ORDER BY sequence").all(cityId) as {event:string}[];
    const events: Event[] = rows.map(row => JSON.parse(row.event));
    resolveCityBrand(events, cityId);
    return events;
  }
  approvedForPublication(id:string,actor:string,authority:CityBrandAuthority){
    if(actor!==SUPER_ADMIN_PUBKEY)throw new Error("Super-admin publication required.");
    const row=this.request(id),challenge=JSON.parse(row.challenge) as CityBrandChallenge;
    if(JSON.stringify(challenge.authority)!==JSON.stringify(authority))throw new Error("City ownership, approval or entitlement changed. Prepare a new request.");
    if(row.status==="active"){
      const publication=this.db.prepare("SELECT * FROM city_brand_publication WHERE request_id=?").get(id) as PublicationRow|undefined;
      if(!row.approved_event||!publication)throw new Error("Active city identity evidence is incomplete.");
      return {row,event:JSON.parse(row.approved_event) as Event,publication};
    }
    if(row.status!=="approved"||!row.approved_event)throw new Error("City identity must be privately approved before publication.");
    const event=JSON.parse(row.approved_event) as Event;readCityBrand(event);
    if(this.head(row.city_id)?.id!==event.id)throw new Error("City identity approval was superseded.");
    return {row,event};
  }
  activate(id:string,actor:string,authority:CityBrandAuthority,readBack:Event[],relays:string[]){
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const approved=this.approvedForPublication(id,actor,authority);
      if(approved.row.status==="active"){this.db.exec("COMMIT");return approved;}
      const current=resolveCityBrand(readBack,approved.row.city_id);
      if(!current||current.event.id!==approved.event.id)throw new Error("Exact city identity read-back is incomplete.");
      const verified=[...new Set(relays)].sort();
      if(!verified.length)throw new Error("No relay independently confirmed the city identity.");
      const publication:PublicationRow={request_id:id,event_id:approved.event.id,verified_at:this.now(),relays:JSON.stringify(verified)};
      this.db.prepare("INSERT INTO city_brand_publication(request_id,event_id,verified_at,relays) VALUES(?,?,?,?)")
        .run(publication.request_id,publication.event_id,publication.verified_at,publication.relays);
      this.db.prepare("UPDATE city_brand_request SET status='active' WHERE id=? AND status='approved'").run(id);
      this.db.exec("COMMIT");return {...approved,row:{...approved.row,status:"active"},publication};
    }catch(error){this.db.exec("ROLLBACK");throw error;}
  }
}
