import {DatabaseSync} from "node:sqlite";
import {afterEach, describe, expect, it} from "vitest";
import {finalizeEvent, getPublicKey} from "nostr-tools";
import {PayoutDestinationStore} from "./payout-destination-store";
import {proSetupTemplate} from "../nostr/pro-setup-command";
const cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f", key = new Uint8Array(32).fill(2), owner = getPublicKey(key);
const authority = {cityId, ownerPubkey: owner, authorityEventId: "a".repeat(64), approvalEventId: "b".repeat(64), entitlementId: "private-entitlement", eligible: true};
const destination = {normalized: "alice@wallet.example", endpoint: "https://wallet.example/.well-known/lnurlp/alice", callback: "https://wallet.example/pay", minSendable: 1000, maxSendable: 10_000_000};
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
function setup() {const db = new DatabaseSync(":memory:"); databases.push(db); return new PayoutDestinationStore(db, () => 2_000_000_000);}
const signed = (destinationValue: string) => finalizeEvent(proSetupTemplate({action:"save-payout",cityId,destination:destinationValue},"https://bitcoinwalk.org",2_000_000_000), key);
describe("private payout destination history", () => {
  it("keeps version history and makes exact signed retries idempotent", () => {
    const store = setup(), first = signed(destination.normalized);
    expect(store.save(authority, first, destination)).toMatchObject({version: 1, ownerPubkey: owner, normalized: destination.normalized});
    expect(store.save(authority, first, destination).version).toBe(1);
    expect(store.save(authority, signed("bob@wallet.example"), {...destination, normalized: "bob@wallet.example"})).toMatchObject({version: 2, normalized: "bob@wallet.example"});
    expect(store.current(cityId)?.version).toBe(2);
  });
  it("rejects editors, previous owners and ineligible cities", () => {
    const store = setup(), outsider = signed(destination.normalized);
    expect(() => store.save({...authority, ownerPubkey: "c".repeat(64)}, outsider, destination)).toThrow("current eligible");
    expect(() => store.save({...authority, eligible: false}, signed(destination.normalized), destination)).toThrow("current eligible");
  });
  it("does not project private evidence from its owner-facing view", () => {
    const store = setup(); store.save(authority, signed(destination.normalized), destination);
    const text = JSON.stringify(store.current(cityId));
    expect(text).not.toContain("private-entitlement"); expect(text).not.toContain("authorityEventId"); expect(text).not.toContain("owner_event");
  });
});
