import {afterEach,describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey,finalizeEvent,verifyEvent} from "nostr-tools";
import {PaymentService, PaymentStore, type Invoice, type PaymentWallet} from "./service";
import {authorizePayment,paymentRequest} from "./auth";

const cityId="be8514a4-9df0-4159-a517-71f65761cbbe", owner="a".repeat(64), revisionId="b".repeat(64);
const preimage="12".repeat(32), hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const now=1800000000;
const invoice:Invoice={invoice:"fixture",paymentHash:hash,amountMsat:21000000,createdAt:now,expiresAt:now+3600};
const stores:PaymentStore[]=[];
function setup(){
  const store=new PaymentStore(":memory:");stores.push(store);
  const wallet:PaymentWallet={makeInvoice:vi.fn(async()=>invoice),lookupInvoice:vi.fn(async()=>({payment_hash:hash,type:"incoming",amount:21000000,state:"pending"}))};
  const verifyCity=vi.fn(async()=>({cityId,owner,cityName:"Memphis",revisionId}));
  const service=new PaymentService(store,wallet,verifyCity,()=>now);
  return{store,wallet,verifyCity,service};
}
afterEach(()=>{stores.splice(0).forEach(s=>s.db.close());});
describe("paid-city settlement",()=>{
 it("adds payment tables to the shared app database without changing unrelated tables",()=>{
  const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE application_marker(value TEXT); INSERT INTO application_marker VALUES ('preserved')");
  const store=new PaymentStore(db);stores.push(store);
  expect(db.prepare("SELECT value FROM application_marker").get()).toEqual({value:"preserved"});
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_invoice'").get()).toBeTruthy();
 });
 it("persists hash before returning an invoice and reuses it",async()=>{const {service,wallet,store}=setup();const a=await service.create(owner,cityId,revisionId);expect(a.paymentHash).toBe(hash);expect(store.rows()[0].paymentHash).toBe(hash);expect(await service.create(owner,cityId,revisionId)).toMatchObject({id:a.id,paymentHash:a.paymentHash,invoice:a.invoice});expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);expect(a.tier).toBe("free");});
 it("atomically binds a new invoice to the confirmed payout version and never rewrites an open invoice",async()=>{const {service,store}=setup();const first=await service.create(owner,cityId,revisionId,3);expect(store.db.prepare("SELECT destinationVersion FROM payment_invoice_payout WHERE invoiceId=?").get(first.id)).toEqual({destinationVersion:3});await service.create(owner,cityId,revisionId,4);expect(store.db.prepare("SELECT destinationVersion FROM payment_invoice_payout WHERE invoiceId=?").get(first.id)).toEqual({destinationVersion:3});});
 it("serializes simultaneous creates",async()=>{const {service,wallet}=setup();await Promise.all([service.create(owner,cityId,revisionId),service.create(owner,cityId,revisionId)]);expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);});
 it("refuses a different owner before creating an invoice",async()=>{const {service,wallet}=setup();await expect(service.create("c".repeat(64),cityId,revisionId)).rejects.toThrow();expect(wallet.makeInvoice).not.toHaveBeenCalled();});
 it("cannot read another organizer's payment",async()=>{const {service}=setup();await service.create(owner,cityId,revisionId);await expect(service.status("c".repeat(64),cityId)).rejects.toThrow();});
 it("marks a city paid and atomically creates its resumable setup task",async()=>{const {service,wallet,store}=setup();const invoiceRow=await service.create(owner,cityId,revisionId,3);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});const result=await service.status(owner,cityId);expect(result?.tier).toBe("paid");expect(result?.status).toBe("paid");expect(store.entitled(cityId)).toBe(true);expect(store.db.prepare("SELECT cityId,entitlementId,registrationVersion,state FROM pro_setup_task WHERE cityId=?").get(cityId)).toEqual({cityId,entitlementId:invoiceRow.id,registrationVersion:3,state:"setup-required"});await service.create(owner,cityId,revisionId);expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);});
 it.each([
   {payment_hash:"f".repeat(64)}, {amount:20999000}, {amount:21001000}, {type:"outgoing"}, {preimage:"34".repeat(32)}, {settled_at:0}, {state:"accepted"},
 ])("rejects invalid settlement evidence %j",async(change)=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage,...change});await service.status(owner,cityId).catch(()=>null);expect(store.entitled(cityId)).toBe(false);});
 it("rolls settlement back instead of attaching setup to conflicting entitlement data",async()=>{const {service,wallet,store}=setup();const row=await service.create(owner,cityId,revisionId,3);store.db.prepare("INSERT INTO paid_city_entitlement VALUES(?,?,?,?,?)").run(cityId,owner,"f".repeat(64),"different-invoice",now-1);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});await expect(service.status(owner,cityId)).rejects.toThrow("entitlement conflict");expect(store.db.prepare("SELECT status FROM payment_invoice WHERE id=?").get(row.id)).toEqual({status:"pending"});expect(store.db.prepare("SELECT * FROM pro_setup_task").all()).toEqual([]);});
 it("does not downgrade a paid city when the wallet becomes unavailable",async()=>{const {service,wallet}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});await service.status(owner,cityId);vi.mocked(wallet.lookupInvoice).mockRejectedValue(new Error("offline"));expect((await service.status(owner,cityId))?.tier).toBe("paid");});
 it("retains an ambiguous creation for operator recovery instead of generating duplicates",async()=>{const {service,wallet,store}=setup();vi.mocked(wallet.makeInvoice).mockRejectedValue(new Error("timeout"));await expect(service.create(owner,cityId,revisionId)).rejects.toThrow();await expect(service.create(owner,cityId,revisionId)).rejects.toThrow();expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);expect(store.rows()[0].status).toBe("creation-uncertain");});
 it("returns a recoverable anonymous checkout when invoice creation is ambiguous",async()=>{const {service,wallet,store}=setup();vi.mocked(wallet.makeInvoice).mockRejectedValue(new Error("timeout"));expect(await service.createGift("d".repeat(64),cityId,revisionId)).toMatchObject({status:"creation-uncertain",tier:"free"});expect(store.gift("d".repeat(64),cityId)?.status).toBe("creation-uncertain");});
 it("allows an ambiguous invoice to be renewed only after its maximum lifetime",async()=>{
  const store=new PaymentStore(":memory:");stores.push(store);let clock=now,calls=0;
  const wallet:PaymentWallet={makeInvoice:vi.fn(async()=>{calls++;if(calls===1)throw new Error("timeout");return{...invoice,createdAt:clock,expiresAt:clock+3600};}),lookupInvoice:vi.fn()};
  const service=new PaymentService(store,wallet,async()=>({cityId,owner,cityName:"Memphis",revisionId}),()=>clock),token="d".repeat(64);
  expect((await service.createGift(token,cityId,revisionId)).status).toBe("creation-uncertain");clock=now+3659;expect((await service.createGift(token,cityId,revisionId)).status).toBe("creation-uncertain");
  clock=now+3660;expect(await service.createGift(token,cityId,revisionId)).toMatchObject({status:"pending",invoice:"fixture"});expect(wallet.makeInvoice).toHaveBeenCalledTimes(2);
 });
 it("keeps pending records when lookup fails",async()=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockRejectedValue(new Error("offline"));await expect(service.status(owner,cityId)).rejects.toThrow();expect(store.rows()[0].status).toBe("pending");expect(store.entitled(cityId)).toBe(false);});
 it("reconciles payments with the browser closed",async()=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});await service.reconcile();expect(store.entitled(cityId)).toBe(true);});
 it("does not let an offline city's reconciliation block another city's checkout",async()=>{
  const store=new PaymentStore(":memory:");stores.push(store);const otherCity="ce8514a4-9df0-4159-a517-71f65761cbbe",otherHash="e".repeat(64);
  store.db.prepare("INSERT INTO payment_invoice(id,cityId,owner,cityName,revisionId,invoice,paymentHash,amountMsat,createdAt,expiresAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .run("old",cityId,owner,"Offline",revisionId,"old-invoice",hash,21000000,now,now+3600,"pending");
  let releaseLookup!:()=>void;const waiting=new Promise<void>(resolve=>{releaseLookup=resolve;});
  const wallet:PaymentWallet={lookupInvoice:vi.fn(async()=>{await waiting;throw new Error("offline");}),makeInvoice:vi.fn(async()=>({...invoice,paymentHash:otherHash,invoice:"other-invoice"}))};
  const service=new PaymentService(store,wallet,async id=>({cityId:id,owner,cityName:id===otherCity?"Other":"Offline",revisionId}),()=>now);
  const reconciliation=service.reconcile();await vi.waitFor(()=>expect(wallet.lookupInvoice).toHaveBeenCalled());
  await expect(service.createGift("d".repeat(64),otherCity,revisionId)).resolves.toMatchObject({cityId:otherCity,invoice:"other-invoice"});
  releaseLookup();await reconciliation;
 });
 it("filters the admin listing by authenticated identity",async()=>{const {service}=setup();await service.create(owner,cityId,revisionId);expect(service.list("outsider","admin")).toEqual([]);expect(service.list("admin","admin")).toHaveLength(1);expect(service.list(owner,"admin")).toHaveLength(1);});
 it("preserves payment hashes and paid tier across a database reopen",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"bw-payment-test-")),path=join(directory,"bitcoinwalk.sqlite");
  let store=new PaymentStore(path);
  try{const service=new PaymentService(store,{makeInvoice:async()=>invoice,lookupInvoice:async()=>({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage})},async()=>({cityId,cityName:"Memphis",owner,revisionId}),()=>now);await service.create(owner,cityId,revisionId);await service.reconcile();store.db.close();store=new PaymentStore(path);expect(store.entitled(cityId)).toBe(true);expect(store.rows()[0].paymentHash).toBe(hash);expect(store.rows()[0].status).toBe("paid");}finally{store.db.close();rmSync(directory,{recursive:true});}
 });
 it("lets an anonymous gift pay for the real owner without granting authority",async()=>{
  const {service,wallet,store}=setup(),token="d".repeat(64);const gift=await service.createGift(token,cityId,revisionId);
  expect(gift).toMatchObject({cityId,cityName:"Memphis",status:"pending",tier:"free",invoice:"fixture"});
  expect(store.rows()[0].owner).toBe(owner);expect(await service.createGift(token,cityId,revisionId)).toMatchObject({invoice:"fixture"});expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);
  await expect(service.giftStatus("e".repeat(64),cityId)).rejects.toThrow("not found");
  vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});
  expect(await service.giftStatus(token,cityId)).toMatchObject({tier:"paid",status:"paid"});
  expect(store.db.prepare("SELECT originalOwnerPubkey,currentOwnerPubkey FROM pro_setup_task WHERE cityId=?").get(cityId)).toEqual({originalOwnerPubkey:owner,currentOwnerPubkey:owner});
 });
 it("shares one invoice across concurrent anonymous devices",async()=>{
  const {service,wallet,store}=setup(),first="d".repeat(64),second="e".repeat(64);
  const [a,b]=await Promise.all([service.createGift(first,cityId,revisionId),service.createGift(second,cityId,revisionId)]);
  expect(a.invoice).toBe("fixture");expect(b.invoice).toBe("fixture");expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);
  expect(store.gift(first,cityId)?.id).toBe(store.gift(second,cityId)?.id);
 });
 it("renews an expired token safely and still recognizes a late old settlement",async()=>{
  const store=new PaymentStore(":memory:");stores.push(store);let clock=now;
  const oldPreimage="21".repeat(32),oldHash=createHash("sha256").update(Buffer.from(oldPreimage,"hex")).digest("hex");
  const newPreimage="22".repeat(32),newHash=createHash("sha256").update(Buffer.from(newPreimage,"hex")).digest("hex");
  const states=new Map([[oldHash,"expired"],[newHash,"pending"]]);
  const wallet:PaymentWallet={makeInvoice:vi.fn(async()=>{const paymentHash=vi.mocked(wallet.makeInvoice).mock.calls.length===1?oldHash:newHash;return{invoice:`invoice-${paymentHash}`,paymentHash,amountMsat:21000000,createdAt:clock,expiresAt:clock+60};}),lookupInvoice:vi.fn(async paymentHash=>{const state=states.get(paymentHash);return state==="settled"?{payment_hash:paymentHash,type:"incoming",amount:21000000,state,settled_at:now+120,preimage:oldPreimage}:{payment_hash:paymentHash,type:"incoming",amount:21000000,state};})};
  const service=new PaymentService(store,wallet,async()=>({cityId,owner,cityName:"Memphis",revisionId}),()=>clock),token="f".repeat(64);
  await service.createGift(token,cityId,revisionId);clock=now+61;expect((await service.giftStatus(token,cityId)).status).toBe("expired");
  const renewed=await service.createGift(token,cityId,revisionId);expect(renewed).toMatchObject({status:"pending",invoice:`invoice-${newHash}`});expect(wallet.makeInvoice).toHaveBeenCalledTimes(2);
  states.set(oldHash,"settled");clock=now+3662;await service.reconcile();expect(store.entitled(cityId)).toBe(true);
  expect(await service.giftStatus(token,cityId)).toMatchObject({tier:"paid"});
 });
});
describe("payment request authorization",()=>{
 it("binds request to the deployment origin and short lifetime",()=>{const event=finalizeEvent(paymentRequest({action:"status",cityId},"https://app-staging.bitcoinwalk.org",now),generateSecretKey());expect(authorizePayment(event,"https://app-staging.bitcoinwalk.org",now).action).toBe("status");expect(()=>authorizePayment(event,"https://bitcoinwalk.org",now)).toThrow();expect(()=>authorizePayment(event,"https://app-staging.bitcoinwalk.org",now+301)).toThrow();});
 it("rejects tampering and client-supplied price",()=>{const event=finalizeEvent(paymentRequest({action:"list"},"https://example.org",now),generateSecretKey());expect(()=>authorizePayment({...event,content:'{"action":"list","amount":1}'},"https://example.org",now)).toThrow();});
 it("requires and signs the exact payout destination before Pro invoice creation",()=>{const key=generateSecretKey(),command={action:"create" as const,cityId,revisionId,payoutDestination:"alice@wallet.example"},event=finalizeEvent(paymentRequest(command,"https://example.org",now),key);expect(authorizePayment(event,"https://example.org",now)).toEqual(command);expect(verifyEvent(event)).toBe(true);event.content=JSON.stringify({...command,payoutDestination:"attacker@wallet.example"});expect(()=>authorizePayment(event,"https://example.org",now)).toThrow();expect(()=>paymentRequest({action:"create",cityId,revisionId} as never,"https://example.org",now)).toThrow();});
});
