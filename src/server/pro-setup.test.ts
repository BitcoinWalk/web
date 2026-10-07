import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {AuthorizationRecord, ApprovalRecord, CityRevision} from "../nostr/city-records";
import {finalizeEvent, generateSecretKey, getPublicKey, type Event} from "nostr-tools";
import {DatabaseSync} from "node:sqlite";
vi.mock("../payments/runtime", () => ({getPaymentRuntime: vi.fn()}));
vi.mock("../logos/runtime", () => ({getLogoCatalog: vi.fn()}));
vi.mock("./share-image", () => ({managedBackground: vi.fn()}));
vi.mock("../logos/profile-artwork", () => ({ProfileArtworkStore: class {ensure = vi.fn().mockResolvedValue({avatar: {url: "https://bitcoinwalk.org/api/media/files/avatar.webp"}, banner: {url: "https://bitcoinwalk.org/api/media/files/banner.webp"}});}}));
vi.mock("../payments/payout-destination-store", () => ({PayoutDestinationStore: class {
  current = vi.fn().mockReturnValue(null);
  registration = vi.fn().mockReturnValue({cityId: "66f137cb-2ac1-4eef-8358-7dd66b45922f", revisionId: "d".repeat(64), version: 1, ownerPubkey: "a".repeat(64), normalized: "alice@example.com", confirmedAt: 1});
}}));
import {getLogoCatalog} from "../logos/runtime";
import {getPaymentRuntime} from "../payments/runtime";
import {managedBackground} from "./share-image";
import {clearProSetupSigner, prepareBrandRequest, prepareProSetupPreview, resolveProSetupAuthority, reviewBrandRequest, saveProSetupSigner, proSetupDependencies} from "./pro-setup";
import {citySignerProofTemplate} from "../nostr/pro-setup-command";
import {ProSetupTaskStore} from "../payments/pro-setup-task-store";
import {SUPER_ADMIN_PUBKEY} from "../nostr/authority";
const cityId = "66f137cb-2ac1-4eef-8358-7dd66b45922f", owner = "a".repeat(64), editor = "b".repeat(64), nextOwner = "c".repeat(64);
const event = (id: string, pubkey: string, created_at: number): Event => ({id: id.repeat(64), pubkey, created_at, kind: 30304, tags: [], content: "", sig: ""});
const revision: CityRevision = {event: event("d", editor, 1), city: {cityId, slug: "radom", cityName: "Radom", description: "Walk", startAt: "2026-10-02T15:00:00Z", meetingPoint: {description: "Square", latitude: 1, longitude: 2}, heroImageUrl: "https://example.com/i"}};
const approval: ApprovalRecord = {event: event("e", owner, 2), approval: {cityId, cityRevisionId: revision.event.id, status: "approved"}};
const grant: AuthorizationRecord = {event: event("f", owner, 1), grant: {cityId, creatorPubkey: owner, creatorRevisionId: revision.event.id, editorPubkeys: [owner, editor], superAdminPubkey: "1".repeat(64)}};
let deps: typeof proSetupDependencies;
let database: DatabaseSync;
beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE payment_invoice(id TEXT PRIMARY KEY,revisionId TEXT NOT NULL);
    CREATE TABLE payment_invoice_payout(invoiceId TEXT PRIMARY KEY,destinationVersion INTEGER NOT NULL);
    INSERT INTO payment_invoice VALUES('private-invoice','${revision.event.id}');
    INSERT INTO payment_invoice_payout VALUES('private-invoice',1);`);
  vi.mocked(getPaymentRuntime).mockReturnValue({store: {db: database}} as never);
  deps = {snapshot: vi.fn().mockResolvedValue({revisions: [revision], approvals: [approval]}), grants: vi.fn().mockResolvedValue([grant]),
    discover: vi.fn().mockResolvedValue(null), entitlement: vi.fn().mockReturnValue({invoiceId: "private-invoice", owner}), restrictions: vi.fn().mockResolvedValue(false)};
});
afterEach(() => {database.close(); vi.restoreAllMocks(); vi.unstubAllEnvs();});
describe("Pro setup fresh authority", () => {
  it("prepares approved artwork without exposing private authority or claiming activation", async () => {
    vi.spyOn(proSetupDependencies, "snapshot").mockImplementation(deps.snapshot);
    vi.spyOn(proSetupDependencies, "grants").mockImplementation(deps.grants);
    vi.spyOn(proSetupDependencies, "discover").mockImplementation(deps.discover);
    vi.spyOn(proSetupDependencies, "entitlement").mockImplementation(deps.entitlement);
    vi.spyOn(proSetupDependencies, "restrictions").mockImplementation(deps.restrictions);
    const ready = vi.fn().mockResolvedValue({jobKey: "job", slug: "radom"});
    vi.mocked(getLogoCatalog).mockReturnValue({ready, file: vi.fn().mockResolvedValue({data: Buffer.from("logo")})} as never);
    vi.mocked(managedBackground).mockResolvedValue(Buffer.from("hero"));
    vi.stubEnv("BITCOINWALK_MEDIA_ROOT", "/tmp/profile-fixture-unused");
    const preview = await prepareProSetupPreview(cityId, owner, "https://bitcoinwalk.org");
    expect(ready).toHaveBeenCalledWith({cityId, revisionId: revision.event.id, slug: "radom"});
    expect(preview).toMatchObject({status: "preparation-only", profile: {name: "BitcoinWalk in Radom"}});
    expect(preview).toMatchObject({setup: {state: "setup-required"}, payout: {configured: false, suggestedDestination: "alice@example.com", registrationVersion: 1}});
    expect(preview.profile).not.toHaveProperty("nip05");
    expect(preview.profile).not.toHaveProperty("lud16");
    expect(JSON.stringify(preview)).not.toContain("private-invoice");
    expect(JSON.stringify(preview)).not.toContain(owner);
    expect(deps.snapshot).toHaveBeenCalledTimes(2);
    vi.mocked(deps.entitlement).mockReturnValueOnce({invoiceId: "private-invoice", owner}).mockReturnValueOnce({invoiceId: "changed", owner});
    await expect(prepareProSetupPreview(cityId, owner, "https://bitcoinwalk.org")).rejects.toThrow("authority changed");
    vi.mocked(managedBackground).mockResolvedValue(null);
    await expect(prepareProSetupPreview(cityId, owner, "https://bitcoinwalk.org")).rejects.toThrow("photo is unavailable");
  });
  it("uses the signed creator grant, never the author of an editor revision", async () => {
    const result = await resolveProSetupAuthority(cityId, owner, deps);
    expect(result.authority).toMatchObject({ownerPubkey: owner, authorityEventId: grant.event.id, entitlementId: "private-invoice"});
    await expect(resolveProSetupAuthority(cityId, editor, deps)).rejects.toThrow("current city owner");
  });
  it("stores only a separately proven expected city key and supports owner cancellation", async () => {
    vi.spyOn(proSetupDependencies, "snapshot").mockImplementation(deps.snapshot);
    vi.spyOn(proSetupDependencies, "grants").mockImplementation(deps.grants);
    vi.spyOn(proSetupDependencies, "discover").mockImplementation(deps.discover);
    vi.spyOn(proSetupDependencies, "entitlement").mockImplementation(deps.entitlement);
    vi.spyOn(proSetupDependencies, "restrictions").mockImplementation(deps.restrictions);
    const key=generateSecretKey(),brandPubkey=getPublicKey(key),origin="https://bitcoinwalk.org";
    const command={action:"confirm-city-signer" as const,cityId,brandPubkey,backupAcknowledged:true as const};
    const proof=finalizeEvent(citySignerProofTemplate(command,origin),key);
    await expect(saveProSetupSigner(cityId,owner,{...command,brandPubkey:editor},proof,origin)).rejects.toThrow("expected identity");
    await expect(saveProSetupSigner(cityId,owner,{...command,brandPubkey:owner},proof,origin)).rejects.toThrow("separate");
    expect(await saveProSetupSigner(cityId,owner,command,proof,origin)).toMatchObject({pubkey:brandPubkey,version:1,state:"confirmed-not-active"});
    expect(await clearProSetupSigner(cityId,owner)).toMatchObject({cleared:true,state:"setup-required"});
    expect(JSON.stringify(database.prepare("SELECT * FROM pro_setup_task").get())).not.toContain("nsec");
  });
  it("binds the saved signer and exact approved artwork into a private BW-103 request",async()=>{
    vi.spyOn(proSetupDependencies,"snapshot").mockImplementation(deps.snapshot);vi.spyOn(proSetupDependencies,"grants").mockImplementation(deps.grants);vi.spyOn(proSetupDependencies,"discover").mockImplementation(deps.discover);vi.spyOn(proSetupDependencies,"entitlement").mockImplementation(deps.entitlement);vi.spyOn(proSetupDependencies,"restrictions").mockImplementation(deps.restrictions);
    vi.mocked(getLogoCatalog).mockReturnValue({ready:vi.fn().mockResolvedValue({jobKey:"job",slug:"radom"}),file:vi.fn().mockResolvedValue({data:Buffer.from("logo")})} as never);vi.mocked(managedBackground).mockResolvedValue(Buffer.from("hero"));vi.stubEnv("BITCOINWALK_MEDIA_ROOT","/tmp/profile-fixture-unused");
    await prepareProSetupPreview(cityId,owner,"https://bitcoinwalk.org");const tasks=new ProSetupTaskStore(database),brand=getPublicKey(generateSecretKey());tasks.confirmPayout(cityId,"private-invoice",owner,1);tasks.confirmSigner(cityId,"private-invoice",owner,brand);
    const request=await prepareBrandRequest(cityId,owner,"https://bitcoinwalk.org");expect(request).toMatchObject({authority:{ownerPubkey:owner},binding:{brandPubkey:brand},profile:{revisionId:revision.event.id,artworkVersion:1,signerVersion:1,payoutVersion:1,name:"BitcoinWalk in Radom",picture:"https://bitcoinwalk.org/api/media/files/avatar.webp",banner:"https://bitcoinwalk.org/api/media/files/banner.webp"}});expect(JSON.stringify(request)).toContain("private-invoice");tasks.clearSigner(cityId,"private-invoice",owner);await expect(reviewBrandRequest(request.requestId,SUPER_ADMIN_PUBKEY)).rejects.toThrow("changed");
  });
  it("follows anchored ownership rotation without transferring the entitlement to the payer", async () => {
    vi.mocked(deps.discover).mockResolvedValue({ownerPubkey: nextOwner, eventId: "9".repeat(64)});
    expect((await resolveProSetupAuthority(cityId, nextOwner, deps)).authority.ownerPubkey).toBe(nextOwner);
    await expect(resolveProSetupAuthority(cityId, owner, deps)).rejects.toThrow("current city owner");
  });
  it("cannot fall back to creator permissions during a directory outage or disagreement", async () => {
    vi.mocked(deps.discover).mockRejectedValue(new Error("Directory incomplete"));
    await expect(resolveProSetupAuthority(cityId, owner, deps)).rejects.toThrow("Directory incomplete");
    expect(deps.entitlement).not.toHaveBeenCalled();
  });
  it("rejects unpaid and suspended cities", async () => {
    vi.mocked(deps.entitlement).mockReturnValue(undefined);
    await expect(resolveProSetupAuthority(cityId, owner, deps)).rejects.toThrow("settled Pro entitlement");
    vi.mocked(deps.entitlement).mockReturnValue({invoiceId: "paid", owner});
    vi.mocked(deps.restrictions).mockResolvedValue(true);
    await expect(resolveProSetupAuthority(cityId, owner, deps)).rejects.toThrow("suspended");
  });
  it("rejects disapproved cities and missing creator grants", async () => {
    vi.mocked(deps.snapshot).mockResolvedValue({revisions: [revision], approvals: [{...approval, approval: {...approval.approval, status: "revoked"}}]});
    await expect(resolveProSetupAuthority(cityId, owner, deps)).rejects.toThrow("approved city");
    vi.mocked(deps.snapshot).mockResolvedValue({revisions: [revision], approvals: [approval]});
    vi.mocked(deps.grants).mockResolvedValue([]);
    await expect(resolveProSetupAuthority(cityId, owner, deps)).rejects.toThrow("creator authorization");
  });
});
