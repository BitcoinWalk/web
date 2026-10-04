import {DatabaseSync} from "node:sqlite";
import {afterEach, describe, expect, it, vi} from "vitest";
import {finalizeEvent} from "nostr-tools";
import {parseApprovalRecord, type ApprovalRecord, type CityRevision} from "../nostr/city-records";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import {LogoJobService, LogoJobStore, approvedLogoCandidates, type LogoApprovalSnapshot} from "./approval-worker";

const warsawId = "032d98ea-f5da-4826-95bd-c4cf9286716e";
const barcelonaId = "d336673e-f18e-415c-b501-70d7bf19a32b";
const otherId = "52c6c6c2-ece9-4780-8364-6d3c00638f42";
const revisionId = "a".repeat(64);
const approvalId = "b".repeat(64);
const now = 1_800_000_000;
const stores: LogoJobStore[] = [];

function revision(cityId = warsawId, id = revisionId, name = "Warszawa", slug = "warszawa", locale = "pl-PL"): CityRevision {
  return {
    event: {id, kind: 30303, created_at: now - 100, pubkey: "c".repeat(64), sig: "", content: "", tags: []},
    city: {cityId, cityName: name, slug, locale, startAt: "2026-10-01T10:00:00.000Z", description: "Walk", meetingPoint: {description: "Square", latitude: 1, longitude: 2}},
  };
}

function approval(cityId = warsawId, id = approvalId, target = revisionId, status: "approved" | "revoked" = "approved", createdAt = now): ApprovalRecord {
  return {
    event: {id, kind: 30304, created_at: createdAt, pubkey: "d".repeat(64), sig: "", content: "", tags: []},
    approval: {cityId, cityRevisionId: target, status},
  };
}

function snapshot(revisions = [revision()], approvals = [approval()]): LogoApprovalSnapshot { return {revisions, approvals}; }
function setup(activatedAt = now) {
  const db = new DatabaseSync(":memory:");
  const store = new LogoJobStore(db, activatedAt); stores.push(store);
  let current = snapshot();
  const read = vi.fn(async () => current);
  const render = vi.fn(async job => `/assets/${job.jobKey}/${job.slug}`);
  const service = new LogoJobService(store, read, render, () => now);
  return {db, store, read, render, service, setSnapshot: (value: LogoApprovalSnapshot) => { current = value; }};
}

afterEach(() => stores.splice(0).forEach(store => store.db.close()));

describe("verified approval to durable logo job", () => {
  it("rejects a forged approval before it can become a queue candidate", () => {
    const data={cityId:warsawId,cityRevisionId:revisionId,status:"approved" as const};
    const signed=finalizeEvent({kind:30304,created_at:now,content:JSON.stringify(data),tags:[["d",warsawId],["i",warsawId],["e",revisionId,"","city-revision"],["status","approved"],["client","bitcoinwalk.org"]]},new Uint8Array(32).fill(2));
    // Relay JSON cannot carry nostr-tools' internal verified-event symbol.
    const forged=JSON.parse(JSON.stringify(signed)) as typeof signed;
    const tampered=JSON.parse(JSON.stringify({...forged,pubkey:SUPER_ADMIN_PUBKEY})) as typeof signed;
    expect(forged.pubkey).not.toBe(SUPER_ADMIN_PUBKEY);
    expect(parseApprovalRecord(forged)).toBeNull();
    expect(parseApprovalRecord(tampered)).toBeNull();
  });
  it("joins only an exact current approved revision", () => {
    expect(approvedLogoCandidates(snapshot())).toHaveLength(1);
    expect(approvedLogoCandidates(snapshot([], [approval()]))).toEqual([]);
    expect(approvedLogoCandidates(snapshot([revision()], [approval(warsawId, approvalId, "f".repeat(64))]))).toEqual([]);
    expect(approvedLogoCandidates(snapshot([revision()], [approval(warsawId, approvalId, revisionId, "revoked")]))).toEqual([]);
  });

  it("uses the approved revision identity, localized name and template in the idempotency key", () => {
    const first = approvedLogoCandidates(snapshot())[0];
    const duplicate = approvedLogoCandidates(snapshot())[0];
    const renamed = approvedLogoCandidates(snapshot([revision(warsawId, "e".repeat(64), "Warszawa Centrum")], [approval(warsawId, "f".repeat(64), "e".repeat(64))]))[0];
    expect(first.jobKey).toBe(duplicate.jobKey);
    expect(first.jobKey).not.toBe(renamed.jobKey);
    expect(first).toMatchObject({cityId: warsawId, revisionId, cityName: "Warszawa", locale: "pl-PL", templateVersion: "city-logo-inkscape-v1.2"});
  });

  it("adds isolated tables without changing payment data", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE payment_marker(value TEXT); INSERT INTO payment_marker VALUES ('preserved')");
    const store = new LogoJobStore(db, now); stores.push(store);
    expect(db.prepare("SELECT value FROM payment_marker").get()).toEqual({value: "preserved"});
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='city_logo_job'").get()).toBeTruthy();
  });

  it("deduplicates reconciliation and backfills every currently approved city", async () => {
    const {service, store, setSnapshot} = setup(now + 10);
    const other = revision(otherId, "e".repeat(64), "Radom", "radom");
    const barcelona = revision(barcelonaId, "1".repeat(64), "Barcelona", "barcelona", "es-ES");
    setSnapshot(snapshot(
      [revision(), barcelona, other],
      [approval(), approval(barcelonaId, "2".repeat(64), barcelona.event.id, "approved", now), approval(otherId, "f".repeat(64), other.event.id, "approved", now)],
    ));
    await service.reconcile(); await service.reconcile();
    expect(store.rows().map(row => row.cityId).sort()).toEqual([barcelonaId, otherId, warsawId].sort());
  });

  it("queues a new post-activation approval for either tier", async () => {
    const {service, store, setSnapshot} = setup(now - 10);
    const city = revision(otherId, "e".repeat(64), "Radom", "radom");
    setSnapshot(snapshot([city], [approval(otherId, "f".repeat(64), city.event.id, "approved", now)]));
    await service.reconcile();
    expect(store.rows()[0]).toMatchObject({cityId: otherId, state: "queued", attempts: 0});
  });

  it("drains a bounded serial batch so a historical rollout does not wait one minute per city", async () => {
    const {service, store, render, setSnapshot} = setup(now + 10);
    const barcelona = revision(barcelonaId, "1".repeat(64), "Barcelona", "barcelona", "es-ES");
    const other = revision(otherId, "e".repeat(64), "Radom", "radom");
    setSnapshot(snapshot(
      [revision(), barcelona, other],
      [approval(), approval(barcelonaId, "2".repeat(64), barcelona.event.id), approval(otherId, "f".repeat(64), other.event.id)],
    ));
    await service.tick();
    expect(render).toHaveBeenCalledTimes(3);
    expect(store.rows().every(row => row.state === "ready" && row.attempts === 1)).toBe(true);
  });

  it("recovers an expired lease after restart and retries with bounded backoff", async () => {
    const {service, store} = setup();
    await service.reconcile();
    const claimed = store.claim(now, 30)!;
    expect(claimed.state).toBe("rendering");
    store.recoverExpired(now + 31);
    expect(store.rows()[0].state).toBe("queued");
    const retry = store.claim(now + 31, 30)!;
    store.fail(retry.jobKey, retry.leaseToken!, "render-failed", now + 31);
    expect(store.rows()[0]).toMatchObject({state: "failed", attempts: 2, lastError: "render-failed"});
    expect(store.claim(now + 32, 30)).toBeNull();
    expect(store.claim(now + 151, 30)).not.toBeNull();
  });

  it("rechecks approval before and after rendering and retains revoked artifacts", async () => {
    const {service, store, render, setSnapshot} = setup();
    await service.reconcile();
    vi.mocked(render).mockImplementation(async job => {
      setSnapshot(snapshot([revision()], [approval(warsawId, "e".repeat(64), revisionId, "revoked", now + 1)]));
      return `/assets/${job.jobKey}/${job.slug}`;
    });
    await service.runOne();
    expect(store.rows()[0]).toMatchObject({state: "obsolete", artifactPath: expect.stringContaining("/assets/")});
  });

  it("does not mutate jobs when the verified relay read fails", async () => {
    const {service, store, read} = setup();
    await service.reconcile();
    vi.mocked(read).mockRejectedValue(new Error("relay unavailable"));
    await expect(service.reconcile()).rejects.toThrow();
    expect(store.rows()).toHaveLength(1);
    expect(store.rows()[0].state).toBe("queued");
  });

  it("reactivates the same revision after revocation without duplicating a ready artifact", async () => {
    const {service, store, setSnapshot} = setup();
    await service.reconcile(); await service.runOne();
    expect(store.rows()[0].state).toBe("ready");
    setSnapshot(snapshot([revision()], [approval(warsawId, "e".repeat(64), revisionId, "revoked", now + 1), approval()]));
    await service.reconcile(); expect(store.rows()[0].state).toBe("obsolete");
    setSnapshot(snapshot([revision()], [approval(warsawId, "f".repeat(64), revisionId, "approved", now + 2)]));
    await service.reconcile();
    expect(store.rows()).toHaveLength(1);
    expect(store.rows()[0].state).toBe("ready");
  });
});
