import {DatabaseSync} from "node:sqlite";
import {finalizeEvent, getPublicKey, type Event} from "nostr-tools";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
vi.mock("../nostr/authority", async () => ({SUPER_ADMIN_PUBKEY:(await import("nostr-tools")).getPublicKey(new Uint8Array(32).fill(1))}));
vi.mock("../payments/runtime",()=>({getPaymentRuntime:vi.fn()}));
vi.mock("./share-image",()=>({managedBackground:vi.fn()}));
vi.mock("../logos/runtime",()=>({getLogoCatalog:vi.fn()}));
vi.mock("../logos/profile-artwork",()=>({ProfileArtworkStore:class {}}));
import {getPaymentRuntime} from "../payments/runtime";
import {CityBrandStore} from "../directory/city-brand-store";
import {ProSetupTaskStore} from "../payments/pro-setup-task-store";
import {PayoutDestinationStore} from "../payments/payout-destination-store";
import {cityBrandProofTemplate} from "../nostr/city-brand";
import {brandPublicationDependencies, proSetupDependencies, resolveRustressProvisionEvidence} from "./pro-setup";
import * as lnurl from "./lnurl-pay";

const adminKey=new Uint8Array(32).fill(1), ownerKey=new Uint8Array(32).fill(2), brandKey=new Uint8Array(32).fill(3);
const admin=getPublicKey(adminKey),owner=getPublicKey(ownerKey),brand=getPublicKey(brandKey);
const cityId="66f137cb-2ac1-4eef-8358-7dd66b45922f",revisionId="c".repeat(64);
const authority={cityId,ownerPubkey:owner,authorityEventId:"a".repeat(64),approvalEventId:"b".repeat(64),entitlementId:"paid",eligible:true};
const profile={revisionId,artworkVersion:1,signerVersion:1,payoutVersion:1,name:"BitcoinWalk in Test",picture:"https://example.org/a.webp",banner:"https://example.org/b.webp",website:"https://bitcoinwalk.org/test"};
const destination={normalized:"fixture@example.org",endpoint:"https://example.org/.well-known/lnurlp/fixture",callback:"https://example.org/callback",minSendable:1000,maxSendable:1000000};
let db:DatabaseSync,requestId:string,store:CityBrandStore,signed:Event;
beforeEach(()=>{
  db=new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE payment_invoice(id TEXT PRIMARY KEY,revisionId TEXT);CREATE TABLE payment_invoice_payout(invoiceId TEXT PRIMARY KEY,destinationVersion INTEGER);INSERT INTO payment_invoice VALUES('paid','${revisionId}');`);
  vi.mocked(getPaymentRuntime).mockReturnValue({store:{db}} as never);
  const event=(id:string)=>({id,pubkey:admin,created_at:1,kind:30304,tags:[],content:"",sig:""});
  vi.spyOn(proSetupDependencies,"snapshot").mockResolvedValue({revisions:[{event:event(revisionId),city:{cityId,slug:"test",cityName:"Test",description:"Test",startAt:"2030-01-01T10:00:00Z",meetingPoint:{description:"Square",latitude:1,longitude:2}}}],approvals:[{event:event(authority.approvalEventId),approval:{cityId,cityRevisionId:revisionId,status:"approved"}}]});
  vi.spyOn(proSetupDependencies,"grants").mockResolvedValue([{event:event(authority.authorityEventId),grant:{cityId,creatorPubkey:owner,creatorRevisionId:revisionId,editorPubkeys:[owner],superAdminPubkey:admin}}]);
  vi.spyOn(proSetupDependencies,"discover").mockResolvedValue(null);
  vi.spyOn(proSetupDependencies,"entitlement").mockReturnValue({invoiceId:"paid",owner});
  vi.spyOn(proSetupDependencies,"restrictions").mockResolvedValue(false);
  const tasks=new ProSetupTaskStore(db);tasks.ensure({cityId,entitlementId:"paid",originalOwnerPubkey:owner,currentOwnerPubkey:owner});
  tasks.confirmPayout(cityId,"paid",owner,1);tasks.confirmSigner(cityId,"paid",owner,brand);
  tasks.confirmArtwork(cityId,"paid",owner,{revisionId,avatar:profile.picture,banner:profile.banner});
  new PayoutDestinationStore(db).save(authority,finalizeEvent({kind:27235,created_at:1,tags:[],content:JSON.stringify({action:"save-payout",cityId,destination:destination.normalized})},ownerKey),destination);
  store=new CityBrandStore(db);const request=store.prepare(owner,authority,"https://bitcoinwalk.org",brand,"activate",profile);requestId=request.requestId;
  const ownerProof=finalizeEvent(cityBrandProofTemplate(request,"owner"),ownerKey),brandProof=finalizeEvent(cityBrandProofTemplate(request,"brand"),brandKey);
  signed=finalizeEvent(store.review(requestId,admin,authority,ownerProof,brandProof),adminKey);
  store.approve(requestId,admin,authority,ownerProof,brandProof,signed);
  store.activate(requestId,admin,authority,[signed],["wss://fixture.example"]);
  vi.spyOn(brandPublicationDependencies,"relays").mockReturnValue(["wss://fixture.example"]);
  vi.spyOn(brandPublicationDependencies,"read").mockResolvedValue([signed]);
  vi.spyOn(lnurl,"validatePayoutDestination").mockResolvedValue(destination);
});
afterEach(()=>{db.close();vi.restoreAllMocks();});
it("assembles disabled configuration from actual signed city binding and owner payout proof",async()=>{
  const result=await resolveRustressProvisionEvidence(requestId);
  expect(result.config).toMatchObject({cityId,brandPubkey:brand,brandEventId:signed.id,payoutDestination:destination.normalized,invoiceIssuance:"disabled",walletRef:"isolated-test"});
  expect(result.proofHash).toMatch(/^[0-9a-f]{64}$/);
  expect(proSetupDependencies.snapshot).toHaveBeenCalledTimes(2);
  expect(lnurl.validatePayoutDestination).toHaveBeenCalledWith(destination.normalized,{blockedDomains:["bitcoinwalk.org"]});
});
it("rejects private approval without published activation",async()=>{
  db.prepare("UPDATE city_brand_request SET status='approved'").run();
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow("active");
});
it("rejects missing or forged relay read-back",async()=>{
  vi.mocked(brandPublicationDependencies.read).mockResolvedValue([]);
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow("read-back");
  vi.mocked(brandPublicationDependencies.read).mockResolvedValue([{...signed,content:"forged"}]);
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow();
});
it("rejects suspension and missing settled entitlement",async()=>{
  vi.mocked(proSetupDependencies.restrictions).mockResolvedValue(true);
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow("suspended");
  vi.mocked(proSetupDependencies.restrictions).mockResolvedValue(false);vi.mocked(proSetupDependencies.entitlement).mockReturnValue(undefined);
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow("settled");
});
it("rejects ownership changes during endpoint validation",async()=>{
  vi.mocked(lnurl.validatePayoutDestination).mockImplementationOnce(async()=>{
    vi.mocked(proSetupDependencies.discover).mockResolvedValue({ownerPubkey:"f".repeat(64),eventId:"e".repeat(64)});return destination;
  });
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow();
});
it("rejects failed endpoint validation",async()=>{
  vi.mocked(lnurl.validatePayoutDestination).mockRejectedValueOnce(new Error("endpoint unavailable"));
  await expect(resolveRustressProvisionEvidence(requestId)).rejects.toThrow("endpoint unavailable");
});
it("uses a fresh owner-signed payout before initial provisioning without replacing the active city identity",async()=>{
  const changed={...destination,normalized:"owner@wallet.example",endpoint:"https://wallet.example/.well-known/lnurlp/owner",callback:"https://wallet.example/callback"};
  const event=finalizeEvent({kind:27235,created_at:2,tags:[],content:JSON.stringify({action:"save-payout",cityId,destination:changed.normalized})},ownerKey);
  const saved=new PayoutDestinationStore(db).save(authority,event,changed);
  new ProSetupTaskStore(db).confirmPayout(cityId,"paid",owner,saved.version);
  vi.mocked(lnurl.validatePayoutDestination).mockResolvedValue(changed);
  const result=await resolveRustressProvisionEvidence(requestId);
  expect(result.config).toMatchObject({payoutVersion:2,payoutDestination:changed.normalized,brandEventId:signed.id});
  expect(db.prepare("SELECT COUNT(*) total FROM city_brand_request").get()).toEqual({total:1});
});
