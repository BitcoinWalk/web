import {afterEach, describe, expect, it} from "vitest";
import {DatabaseSync} from "node:sqlite";
import {ProSetupTaskStore} from "./pro-setup-task-store";

const cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f", entitlementId = "invoice-one";
const owner = "a".repeat(64), nextOwner = "b".repeat(64);
const databases: DatabaseSync[] = [];
const setup = () => {const db = new DatabaseSync(":memory:"); databases.push(db); return {db, store: new ProSetupTaskStore(db)};};
afterEach(() => databases.splice(0).forEach(db => db.close()));

describe("durable Pro setup tasks", () => {
  it("creates one idempotent task per settled entitlement without exposing private identifiers", () => {
    const {store} = setup();
    const first = store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner, registrationVersion: 3}, 100);
    const retry = store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner, registrationVersion: 3}, 200);
    expect(first).toEqual({cityId, state: "setup-required", registrationVersion: 3, createdAt: 100, updatedAt: 100});
    expect(retry).toEqual(first);
    expect(JSON.stringify(retry)).not.toContain(entitlementId);
    expect(JSON.stringify(retry)).not.toContain(owner);
  });

  it("records owner confirmation and survives a new store instance", () => {
    const {db, store} = setup();
    store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner}, 100);
    expect(store.confirmPayout(cityId, entitlementId, owner, 2, 110)).toMatchObject({state: "payout-confirmed", payoutVersion: 2});
    expect(new ProSetupTaskStore(db).get(cityId)).toMatchObject({state: "payout-confirmed", payoutVersion: 2});
  });

  it("keeps a distinct verified city signer and payout as independent resumable gates", () => {
    const {store} = setup(), brand = "c".repeat(64);
    store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner}, 100);
    expect(store.confirmSigner(cityId, entitlementId, owner, brand, 105)).toMatchObject({state: "signer-confirmed", signer: {pubkey: brand, version: 1, confirmedAt: 105}});
    expect(store.confirmSigner(cityId, entitlementId, owner, brand, 110)).toMatchObject({signer: {version: 1, confirmedAt: 105}});
    expect(() => store.confirmSigner(cityId, entitlementId, owner, "d".repeat(64), 111)).toThrow("Clear the saved");
    expect(store.confirmPayout(cityId, entitlementId, owner, 2, 115)).toMatchObject({state: "ready-for-proof", payoutVersion: 2});
    expect(store.clearSigner(cityId, entitlementId, owner, 120)).toEqual({cityId, state: "payout-confirmed", payoutVersion: 2, createdAt: 100, updatedAt: 120});
    expect(() => store.confirmSigner(cityId, entitlementId, owner, owner)).toThrow("separate");
  });

  it("adds signer recovery columns to tasks created by the earlier schema", () => {
    const db = new DatabaseSync(":memory:"); databases.push(db);
    db.exec(`CREATE TABLE pro_setup_task(cityId TEXT PRIMARY KEY,entitlementId TEXT NOT NULL UNIQUE,originalOwnerPubkey TEXT NOT NULL,currentOwnerPubkey TEXT NOT NULL,
      registrationVersion INTEGER,payoutVersion INTEGER,state TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);`);
    const store = new ProSetupTaskStore(db);
    store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner});
    expect(store.confirmSigner(cityId, entitlementId, owner, "c".repeat(64))).toMatchObject({state: "signer-confirmed", signer: {version: 1}});
  });

  it("invalidates the prior owner's payout on a trusted ownership rotation", () => {
    const {store} = setup();
    store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner, registrationVersion: 1}, 100);
    store.confirmPayout(cityId, entitlementId, owner, 4, 110);
    expect(store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: nextOwner, registrationVersion: 1}, 120))
      .toEqual({cityId, state: "setup-required", registrationVersion: 1, createdAt: 100, updatedAt: 120});
    expect(() => store.confirmPayout(cityId, entitlementId, owner, 5)).toThrow("authority changed");
  });

  it("fails closed on entitlement or checkout binding conflicts", () => {
    const {store} = setup();
    store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner, registrationVersion: 1});
    expect(() => store.ensure({cityId, entitlementId: "another", originalOwnerPubkey: owner, currentOwnerPubkey: owner})).toThrow("entitlement conflict");
    expect(() => store.ensure({cityId, entitlementId, originalOwnerPubkey: owner, currentOwnerPubkey: owner, registrationVersion: 2})).toThrow("binding conflict");
  });
});
