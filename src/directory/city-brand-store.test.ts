import {DatabaseSync} from "node:sqlite";
import {finalizeEvent, getPublicKey} from "nostr-tools";
import {afterEach, describe, expect, it, vi} from "vitest";
vi.mock("../nostr/authority", async () => {
  const {getPublicKey} = await import("nostr-tools");
  return {SUPER_ADMIN_PUBKEY: getPublicKey(new Uint8Array(32).fill(1))};
});
import {CityBrandStore} from "./city-brand-store";
import {cityBrandProofTemplate, readCityBrand, resolveCityBrand, type CityBrandAuthority, type CityBrandChallenge} from "../nostr/city-brand";
const adminKey = new Uint8Array(32).fill(1), ownerKey = new Uint8Array(32).fill(2), brandKey = new Uint8Array(32).fill(3), otherKey = new Uint8Array(32).fill(4);
const admin = getPublicKey(adminKey), owner = getPublicKey(ownerKey), brand = getPublicKey(brandKey), other = getPublicKey(otherKey);
const authority: CityBrandAuthority = {cityId:"66f137cb-2ac1-4eef-8358-7dd66b45922f", ownerPubkey:owner,
  authorityEventId:"a".repeat(64), approvalEventId:"b".repeat(64), entitlementId:"private-paid-entitlement", eligible:true};
const origin = "https://bitcoinwalk.org";
const profile = {revisionId:"c".repeat(64),artworkVersion:1,signerVersion:1,payoutVersion:1,name:"BitcoinWalk in Test",picture:"https://bitcoinwalk.org/avatar.webp",banner:"https://bitcoinwalk.org/banner.webp",website:"https://bitcoinwalk.org/test"};
const databases: DatabaseSync[] = [];
afterEach(() => {for (const db of databases.splice(0)) db.close();});
function setup() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  let now = 2000000000;
  return {db, store:new CityBrandStore(db, () => now), advance:(seconds:number) => {now += seconds;}};
}
function proofs(request: CityBrandChallenge, secret = brandKey) {
  return {ownerProof:finalizeEvent(cityBrandProofTemplate(request,"owner"),ownerKey),
    brandProof:finalizeEvent(cityBrandProofTemplate(request,"brand"),secret)};
}
function approve(store: CityBrandStore, request: CityBrandChallenge, secret = brandKey, current = authority) {
  const {ownerProof,brandProof} = proofs(request, secret);
  const template = store.review(request.requestId, admin, current, ownerProof, brandProof);
  const signed = finalizeEvent(template, adminKey);
  return {signed, ownerProof, brandProof, result:store.approve(request.requestId,admin,current,ownerProof,brandProof,signed)};
}
describe("branded city authority contract and private storage", () => {
  it("requires both signatures and publishes no private owner evidence", () => {
    const {store,db} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile);
    const result = approve(store,request);
    expect(readCityBrand(result.result)).toMatchObject({brandPubkey:brand,action:"activate",sequence:0});
    const publicData = JSON.stringify(store.publicHistory(authority.cityId));
    for (const privateValue of [owner,authority.authorityEventId,authority.entitlementId,result.ownerProof.id,profile.picture]) expect(publicData).not.toContain(privateValue);
    expect(db.prepare("SELECT owner_proof FROM city_brand_request").get()).toEqual({owner_proof:JSON.stringify(result.ownerProof)});
  });
  it("persists request-bound owner, city-signer and artwork evidence for later admin review",()=>{
    const {store}=setup(),request=store.prepare(owner,authority,origin,brand,"activate",profile),p=proofs(request);
    expect(store.submitProofs(request.requestId,owner,authority,p.ownerProof,p.brandProof)).toMatchObject({owner_proof:expect.any(String),brand_proof:expect.any(String)});
    const template=store.reviewStored(request.requestId,admin,authority),signed=finalizeEvent(template,adminKey);
    expect(store.approveStored(request.requestId,admin,authority,signed).id).toBe(signed.id);
    expect(JSON.stringify(store.publicHistory(authority.cityId))).not.toContain(profile.picture);
  });
  it("activates only the exact independently read-back approved event and reuses exact retries",()=>{
    const {store}=setup(),request=store.prepare(owner,authority,origin,brand,"activate",profile),p=approve(store,request);
    expect(store.reviewQueue()).toHaveLength(1);
    expect(()=>store.activate(request.requestId,admin,authority,[],["wss://relay.example/"])).toThrow("read-back");
    const active=store.activate(request.requestId,admin,authority,[p.signed],["wss://relay.example/"]);
    expect(active).toMatchObject({row:{status:"active"},publication:{event_id:p.signed.id}});
    expect(store.reviewQueue()).toEqual([]);
    expect(store.completed()).toEqual([expect.objectContaining({id:request.requestId,status:"active"})]);
    expect(store.activate(request.requestId,admin,authority,[p.signed],["wss://relay.example/"])).toMatchObject({row:{status:"active"}});
  });
  it("reuses only an identical unexpired request and expires abandoned requests",()=>{
    const {store,advance}=setup(),first=store.prepare(owner,authority,origin,brand,"activate",profile);
    expect(store.prepare(owner,authority,origin,brand,"activate",profile).requestId).toBe(first.requestId);
    expect(()=>store.prepare(owner,authority,origin,brand,"activate",{...profile,name:"Changed"})).toThrow("different city account");
    advance(900);expect(store.pending()).toEqual([]);expect(store.prepare(owner,authority,origin,brand,"activate",profile).requestId).not.toBe(first.requestId);
  });
  it("denies editors, donors and super-admin impersonating owner", () => {
    const {store} = setup();
    for (const actor of [other,brand,admin]) expect(() => store.prepare(actor,authority,origin,brand,"activate",profile)).toThrow("owner");
    expect(() => store.prepare(owner,authority,origin,owner,"activate",profile)).toThrow("separate");
    expect(() => store.prepare(owner,{...authority,eligible:false},origin,brand,"activate",profile)).toThrow("eligible");
  });
  it("denies foreign or swapped signature roles and unapproved review", () => {
    const {store} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), p = proofs(request);
    expect(() => store.review(request.requestId,owner,authority,p.ownerProof,p.brandProof)).toThrow("Super-admin");
    expect(() => store.review(request.requestId,admin,authority,p.brandProof,p.ownerProof)).toThrow("proof");
    expect(() => store.review(request.requestId,admin,authority,p.ownerProof,proofs(request,otherKey).brandProof)).toThrow("proof");
    expect(() => store.review(request.requestId,admin,authority,p.ownerProof)).toThrow("proof");
  });
  it.each(["ownerPubkey","authorityEventId","approvalEventId","entitlementId","cityId","eligible"] as const)("rechecks changed %s before approving", field => {
    const {store} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), p = proofs(request);
    const value = field === "eligible" ? false : field === "cityId" ? "66f137cb-2ac1-4eef-8358-7dd66b459230" : field === "ownerPubkey" ? other : field === "entitlementId" ? "another" : "c".repeat(64);
    expect(() => store.review(request.requestId,admin,{...authority,[field]:value},p.ownerProof,p.brandProof)).toThrow("changed");
  });
  it("expires requests and rejects replay onto a newly prepared request", () => {
    const {store,advance} = setup(), old = store.prepare(owner,authority,origin,brand,"activate",profile), p = proofs(old);
    advance(900);
    expect(() => store.review(old.requestId,admin,authority,p.ownerProof,p.brandProof)).toThrow("expired");
    const next = store.prepare(owner,authority,origin,brand,"activate",profile);
    expect(() => store.review(next.requestId,admin,authority,p.ownerProof,p.brandProof)).toThrow("proof");
  });
  it("deduplicates exact approved retries across store restart", () => {
    const {store,db} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), p = approve(store,request);
    const reopened = new CityBrandStore(db);
    expect(reopened.approve(request.requestId,admin,authority,p.ownerProof,p.brandProof,p.signed).id).toBe(p.signed.id);
    expect(reopened.publicHistory(authority.cityId)).toHaveLength(1);
  });
  it("replaces with new key proof, revokes without lost key, and never replays an old binding", () => {
    const {store,advance} = setup(), initial = store.prepare(owner,authority,origin,brand,"activate",profile), first = approve(store,initial);
    advance(1);
    approve(store,store.prepare(owner,authority,origin,other,"replace",profile),otherKey);
    advance(1);
    const revoke = store.prepare(owner,authority,origin,other,"revoke",profile), p = proofs(revoke,otherKey);
    const signed = finalizeEvent(store.review(revoke.requestId,admin,authority,p.ownerProof),adminKey);
    store.approve(revoke.requestId,admin,authority,p.ownerProof,undefined,signed);
    expect(resolveCityBrand(store.publicHistory(authority.cityId),authority.cityId)?.binding.action).toBe("revoke");
    expect(() => store.approve(initial.requestId,admin,authority,first.ownerProof,first.brandProof,first.signed)).toThrow("superseded");
  });
  it("rejects unsigned mutation even when the library previously cached verification", () => {
    const {store} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), p = proofs(request);
    p.ownerProof.content = p.ownerProof.content.replace("private-paid-entitlement","stolen");
    expect(() => store.review(request.requestId,admin,authority,p.ownerProof,p.brandProof)).toThrow("signature");
  });
  it("rejects malicious approval fields and rolls back atomically", () => {
    const {store} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), p = proofs(request);
    const template = store.review(request.requestId,admin,authority,p.ownerProof,p.brandProof);
    const signed = finalizeEvent({...template,content:JSON.stringify({...JSON.parse(template.content),ownerPubkey:owner})},adminKey);
    expect(() => store.approve(request.requestId,admin,authority,p.ownerProof,p.brandProof,signed)).toThrow();
    expect(store.publicHistory(authority.cityId)).toEqual([]);
    expect(approve(store,request).result).toBeDefined();
  });
  it("refuses gaps, forks and foreign histories", () => {
    const {store,advance} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), first = approve(store,request).signed;
    advance(1);
    const second = approve(store,store.prepare(owner,authority,origin,other,"replace",profile),otherKey).signed;
    expect(() => resolveCityBrand([second],authority.cityId)).toThrow();
    const fork = finalizeEvent({...second,content:second.content.replace(other,getPublicKey(new Uint8Array(32).fill(5)))},adminKey);
    expect(() => resolveCityBrand([first,second,fork],authority.cityId)).toThrow();
    expect(() => resolveCityBrand([first],"66f137cb-2ac1-4eef-8358-7dd66b459230")).toThrow("Foreign");
    expect(resolveCityBrand([first,first],authority.cityId)?.event.id).toBe(first.id);
  });
  it("permits cancelling stale setup without granting approval", () => {
    const {store} = setup(), request = store.prepare(owner,authority,origin,brand,"activate",profile), p = proofs(request);
    expect(() => store.cancel(request.requestId,other,authority)).toThrow("owner");
    store.cancel(request.requestId,owner,authority);
    expect(() => store.review(request.requestId,admin,authority,p.ownerProof,p.brandProof)).toThrow("pending");
    expect(store.prepare(owner,authority,origin,brand,"activate",profile)).toBeDefined();
  });
});
