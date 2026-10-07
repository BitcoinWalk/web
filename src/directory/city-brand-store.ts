import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Event} from "nostr-tools";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {authorizeCityBrand, createCityBrandChallenge, readCityBrand, resolveCityBrand,
  type CityBrandAuthority} from "../nostr/city-brand";

/** Private, opt-in store. No runtime instantiates it until the activation API lands.
 * All authority inputs must come from fresh verified server-side resolvers. */
export class CityBrandStore {
  constructor(private db: DatabaseSync, private now = () => Math.floor(Date.now() / 1000)) {
    db.exec(`CREATE TABLE IF NOT EXISTS city_brand_request (
      id TEXT PRIMARY KEY, city_id TEXT NOT NULL, challenge TEXT NOT NULL,
      status TEXT NOT NULL, expires_at INTEGER NOT NULL, owner_proof TEXT, brand_proof TEXT,
      approved_event TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS city_brand_pending ON city_brand_request(city_id) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS city_brand_binding (
      event_id TEXT PRIMARY KEY, city_id TEXT NOT NULL, sequence INTEGER NOT NULL, event TEXT NOT NULL,
      UNIQUE(city_id,sequence));`);
  }
  private head(cityId: string) {
    const rows = this.db.prepare("SELECT event FROM city_brand_binding WHERE city_id=? ORDER BY sequence").all(cityId) as {event:string}[];
    return resolveCityBrand(rows.map(row => JSON.parse(row.event)), cityId)?.event ?? null;
  }
  prepare(actor: string, authority: CityBrandAuthority, origin: string, brandPubkey: string, action: "activate" | "replace" | "revoke") {
    if (actor !== authority.ownerPubkey) throw new Error("Only the verified city owner may prepare this request.");
    const now = this.now();
    this.db.prepare("UPDATE city_brand_request SET status='expired' WHERE status='pending' AND expires_at<=?").run(now);
    const challenge = createCityBrandChallenge({requestId: randomUUID(), authority, origin, brandPubkey, action, previous: this.head(authority.cityId), now});
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
    const row = this.db.prepare("SELECT * FROM city_brand_request WHERE id=?").get(id) as
      {id:string; city_id:string; challenge:string; status:string; approved_event:string|null} | undefined;
    if (!row) throw new Error("City account request not found.");
    return row;
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
}
