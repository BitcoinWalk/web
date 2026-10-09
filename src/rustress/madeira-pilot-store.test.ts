import {DatabaseSync} from "node:sqlite";
import {finalizeEvent, getPublicKey} from "nostr-tools";
import {afterEach, describe, expect, it, vi} from "vitest";
vi.mock("../nostr/madeira-pilot-policy",async original=>{
  const real=await original<typeof import("../nostr/madeira-pilot-policy")>();
  const {getPublicKey}=await import("nostr-tools");
  return {MADEIRA_PILOT:{...real.MADEIRA_PILOT,pubkey:getPublicKey(new Uint8Array(32).fill(2))}};
});
vi.mock("../nostr/authority",async()=>({SUPER_ADMIN_PUBKEY:(await import("nostr-tools")).getPublicKey(new Uint8Array(32).fill(1))}));
import {MADEIRA_PILOT, madeiraProofTemplate, madeiraRequest, authorizeMadeiraRequest, verifyMadeiraProof} from "../nostr/madeira-pilot";
import {MadeiraPilotStore} from "./madeira-pilot-store";
const owner=new Uint8Array(32).fill(2),admin=new Uint8Array(32).fill(1);
const databases:DatabaseSync[]=[];
afterEach(()=>{databases.splice(0).forEach(db=>db.close());});
function fixture(){
  const db=new DatabaseSync(":memory:");databases.push(db);
  db.exec("CREATE TABLE paid_city_entitlement (cityId TEXT); CREATE TABLE payment_invoice (status TEXT); INSERT INTO payment_invoice VALUES ('pending')");
  let now=1000;
  const snapshot={revisionId:"a".repeat(64),approvalEventId:"b".repeat(64),authorityEventId:"c".repeat(64),payoutVersion:1,payoutDestination:"owner@example.org"};
  const read=vi.fn(async()=>({...snapshot}));
  const store=new MadeiraPilotStore(db,read,()=>now);
  return {db,store,read,snapshot,advance:()=>{now+=3601;},now:()=>now};
}
describe("private Madeira existing-account rehearsal",()=>{
  it("requires owner then admin, permits only disabled fixture provisioning, and leaves paid records unchanged",async()=>{
    const f=fixture(),view=(await f.store.prepare())!;
    const op=finalizeEvent(madeiraProofTemplate(view.challenge,"owner"),owner);
    const ap=finalizeEvent(madeiraProofTemplate(view.challenge,"admin"),admin);
    await expect(f.store.accept("admin",ap)).rejects.toThrow("confirm first");
    await f.store.accept("owner",op);
    await expect(f.store.evidence(view.challenge.requestId)).rejects.toThrow("Both private");
    await f.store.accept("admin",ap);
    const evidence=await f.store.evidence(view.challenge.requestId);
    expect(evidence.config).toMatchObject({cityId:MADEIRA_PILOT.cityId,brandPubkey:getPublicKey(owner),walletRef:"isolated-test",invoiceIssuance:"disabled",organizerBasisPoints:7900,retainedBasisPoints:2100,brandEventId:ap.id});
    expect(f.db.prepare("SELECT * FROM paid_city_entitlement").all()).toHaveLength(0);
    expect(f.db.prepare("SELECT status FROM payment_invoice").get()?.status).toBe("pending");
    await f.store.accept("admin",ap);
    expect(await f.store.evidence(view.challenge.requestId)).toEqual(evidence);
    f.advance();expect((await f.store.prepare())?.challenge.requestId).toBe(view.challenge.requestId);
    expect(await f.store.evidence(view.challenge.requestId)).toEqual(evidence);
  });
  it("rejects the wrong account, role, scope, signature and expired proof",async()=>{
    const f=fixture(),v=(await f.store.prepare())!;
    await expect(f.store.accept("owner",finalizeEvent(madeiraProofTemplate(v.challenge,"owner"),admin))).rejects.toThrow("invalid");
    await expect(f.store.accept("owner",finalizeEvent(madeiraProofTemplate(v.challenge,"admin"),owner))).rejects.toThrow("invalid");
    const proof=finalizeEvent(madeiraProofTemplate(v.challenge,"owner"),owner);
    expect(()=>verifyMadeiraProof({...proof,sig:"0".repeat(128)},v.challenge,"owner",1000)).toThrow("invalid");
    expect(()=>madeiraProofTemplate({...v.challenge,origin:"https://bitcoinwalk.org"} as unknown as typeof v.challenge,"owner")).toThrow();
    f.advance();await expect(f.store.accept("owner",proof)).rejects.toThrow("expired");
    expect((await f.store.prepare())?.challenge.requestId).not.toBe(v.challenge.requestId);
    await expect(f.store.accept("owner",proof)).rejects.toThrow("invalid");
  });
  it("fails closed when approval, authority or payout changes or cannot be read",async()=>{
    const f=fixture(),v=(await f.store.prepare())!;
    await f.store.accept("owner",finalizeEvent(madeiraProofTemplate(v.challenge,"owner"),owner));
    await f.store.accept("admin",finalizeEvent(madeiraProofTemplate(v.challenge,"admin"),admin));
    for(const key of ["revisionId","approvalEventId","authorityEventId"] as const){
      f.read.mockResolvedValueOnce({...f.snapshot,[key]:"d".repeat(64)});
      await expect(f.store.evidence(v.challenge.requestId)).rejects.toThrow("changed");
    }
    f.snapshot.payoutVersion=2;
    await expect(f.store.prepare()).rejects.toThrow("review required");
    await expect(f.store.evidence(v.challenge.requestId)).rejects.toThrow("changed");
    f.read.mockRejectedValueOnce(new Error("offline"));await expect(f.store.evidence(v.challenge.requestId)).rejects.toThrow("offline");
  });
  it("rejects changes between challenge and signature",async()=>{
    const f=fixture(),v=(await f.store.prepare())!;f.snapshot.payoutDestination="changed@example.org";
    await expect(f.store.accept("owner",finalizeEvent(madeiraProofTemplate(v.challenge,"owner"),owner))).rejects.toThrow("changed");
    expect(f.store.view()?.ownerConfirmed).toBe(false);
  });
  it("authenticates exact private request origin and role; rejects old or unrelated keys",()=>{
    const signed=finalizeEvent(madeiraRequest({action:"load"},1000),owner);
    expect(authorizeMadeiraRequest(signed,1000)).toEqual({action:"load"});
    expect(()=>authorizeMadeiraRequest(signed,1301)).toThrow();
    expect(()=>authorizeMadeiraRequest(finalizeEvent(madeiraRequest({action:"admin"},1000),owner),1000)).toThrow("role");
    expect(()=>authorizeMadeiraRequest(finalizeEvent(madeiraRequest({action:"owner"},1000),admin),1000)).toThrow("role");
    expect(()=>authorizeMadeiraRequest(finalizeEvent(madeiraRequest({action:"managed-admin"},1000),owner),1000)).toThrow("role");
    expect(()=>authorizeMadeiraRequest(finalizeEvent(madeiraRequest({action:"load"},1000),new Uint8Array(32).fill(3)),1000)).toThrow();
    const template=madeiraRequest({action:"load"},1000);template.tags[0][1]="https://bitcoinwalk.org/api/madeira-pilot";
    expect(()=>authorizeMadeiraRequest(finalizeEvent(template,owner),1000)).toThrow();
  });
});
