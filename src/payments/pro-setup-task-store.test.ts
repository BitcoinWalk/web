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
