import type {DatabaseSync} from "node:sqlite";
import {getEventHash, verifyEvent, type Event} from "nostr-tools";
import type {CityBrandAuthority} from "../nostr/city-brand";
import type {ValidatedPayoutDestination} from "../server/lnurl-pay";
import {normalizePayoutDestination} from "../server/lnurl-pay";

export type PayoutDestinationVersion = {cityId: string; version: number; ownerPubkey: string; normalized: string; endpoint: string; callback: string; minSendable: number; maxSendable: number; confirmedAt: number};
export class PayoutDestinationStore {
  constructor(private db: DatabaseSync, private now = () => Math.floor(Date.now() / 1000)) {
    db.exec(`CREATE TABLE IF NOT EXISTS payout_destination_version (
      city_id TEXT NOT NULL,version INTEGER NOT NULL,owner_pubkey TEXT NOT NULL,normalized TEXT NOT NULL,
      endpoint TEXT NOT NULL,callback TEXT NOT NULL,min_sendable INTEGER NOT NULL,max_sendable INTEGER NOT NULL,
      authority TEXT NOT NULL,owner_event_id TEXT NOT NULL,owner_event TEXT NOT NULL,confirmed_at INTEGER NOT NULL,
      PRIMARY KEY(city_id,version),UNIQUE(city_id,owner_event_id));`);
  }
  current(cityId: string): PayoutDestinationVersion | null {
    const row = this.db.prepare("SELECT city_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,confirmed_at FROM payout_destination_version WHERE city_id=? ORDER BY version DESC LIMIT 1").get(cityId) as Record<string, unknown> | undefined;
    return row ? {cityId: String(row.city_id), version: Number(row.version), ownerPubkey: String(row.owner_pubkey), normalized: String(row.normalized), endpoint: String(row.endpoint), callback: String(row.callback), minSendable: Number(row.min_sendable), maxSendable: Number(row.max_sendable), confirmedAt: Number(row.confirmed_at)} : null;
  }
  save(authority: CityBrandAuthority, ownerEvent: Event, destination: ValidatedPayoutDestination) {
    const signed: Event = JSON.parse(JSON.stringify(ownerEvent));
    let command: {action?:unknown;cityId?:unknown;destination?:unknown} = {};
    try {command = JSON.parse(signed.content);} catch {throw new Error("Invalid owner-signed payout confirmation.");}
    const normalized = typeof command.destination === "string" ? normalizePayoutDestination(command.destination).normalized : "";
    if (!authority.eligible || signed.pubkey !== authority.ownerPubkey || signed.kind !== 27235 || getEventHash(signed) !== signed.id || !verifyEvent(signed) ||
      command.action !== "save-payout" || command.cityId !== authority.cityId || normalized !== destination.normalized) {
      throw new Error("Only the current eligible city owner may confirm the exact payout destination.");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const retry = this.db.prepare("SELECT version FROM payout_destination_version WHERE city_id=? AND owner_event_id=?").get(authority.cityId, signed.id) as {version:number}|undefined;
      if (retry) {const row = this.db.prepare("SELECT city_id,version,owner_pubkey,normalized,endpoint,callback,min_sendable,max_sendable,confirmed_at FROM payout_destination_version WHERE city_id=? AND version=?").get(authority.cityId,retry.version) as Record<string,unknown>; const result={cityId:String(row.city_id),version:Number(row.version),ownerPubkey:String(row.owner_pubkey),normalized:String(row.normalized),endpoint:String(row.endpoint),callback:String(row.callback),minSendable:Number(row.min_sendable),maxSendable:Number(row.max_sendable),confirmedAt:Number(row.confirmed_at)}; this.db.exec("COMMIT"); return result;}
      const prior = this.current(authority.cityId), version = (prior?.version ?? 0) + 1, confirmedAt = this.now();
      this.db.prepare("INSERT INTO payout_destination_version VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(authority.cityId, version, authority.ownerPubkey,
        destination.normalized, destination.endpoint, destination.callback, destination.minSendable, destination.maxSendable,
        JSON.stringify(authority), signed.id, JSON.stringify(signed), confirmedAt);
      const result = this.current(authority.cityId)!; this.db.exec("COMMIT"); return result;
    } catch (error) {this.db.exec("ROLLBACK"); throw error;}
  }
}
