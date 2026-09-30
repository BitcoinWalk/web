import {afterEach,describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {generateSecretKey,finalizeEvent} from "nostr-tools";
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
 it("serializes simultaneous creates",async()=>{const {service,wallet}=setup();await Promise.all([service.create(owner,cityId,revisionId),service.create(owner,cityId,revisionId)]);expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);});
 it("refuses a different owner before creating an invoice",async()=>{const {service,wallet}=setup();await expect(service.create("c".repeat(64),cityId,revisionId)).rejects.toThrow();expect(wallet.makeInvoice).not.toHaveBeenCalled();});
 it("cannot read another organizer's payment",async()=>{const {service}=setup();await service.create(owner,cityId,revisionId);await expect(service.status("c".repeat(64),cityId)).rejects.toThrow();});
 it("marks a city paid only after matching settled incoming payment and preimage",async()=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});const result=await service.status(owner,cityId);expect(result?.tier).toBe("paid");expect(result?.status).toBe("paid");expect(store.entitled(cityId)).toBe(true);await service.create(owner,cityId,revisionId);expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);});
 it.each([
   {payment_hash:"f".repeat(64)}, {amount:20999000}, {amount:21001000}, {type:"outgoing"}, {preimage:"34".repeat(32)}, {settled_at:0}, {state:"accepted"},
 ])("rejects invalid settlement evidence %j",async(change)=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage,...change});await service.status(owner,cityId).catch(()=>null);expect(store.entitled(cityId)).toBe(false);});
 it("does not downgrade a paid city when the wallet becomes unavailable",async()=>{const {service,wallet}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});await service.status(owner,cityId);vi.mocked(wallet.lookupInvoice).mockRejectedValue(new Error("offline"));expect((await service.status(owner,cityId))?.tier).toBe("paid");});
 it("retains an ambiguous creation for operator recovery instead of generating duplicates",async()=>{const {service,wallet,store}=setup();vi.mocked(wallet.makeInvoice).mockRejectedValue(new Error("timeout"));await expect(service.create(owner,cityId,revisionId)).rejects.toThrow();await expect(service.create(owner,cityId,revisionId)).rejects.toThrow();expect(wallet.makeInvoice).toHaveBeenCalledTimes(1);expect(store.rows()[0].status).toBe("creation-uncertain");});
 it("keeps pending records when lookup fails",async()=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockRejectedValue(new Error("offline"));await expect(service.status(owner,cityId)).rejects.toThrow();expect(store.rows()[0].status).toBe("pending");expect(store.entitled(cityId)).toBe(false);});
 it("reconciles payments with the browser closed",async()=>{const {service,wallet,store}=setup();await service.create(owner,cityId,revisionId);vi.mocked(wallet.lookupInvoice).mockResolvedValue({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage});await service.reconcile();expect(store.entitled(cityId)).toBe(true);});
 it("filters the admin listing by authenticated identity",async()=>{const {service}=setup();await service.create(owner,cityId,revisionId);expect(service.list("outsider","admin")).toEqual([]);expect(service.list("admin","admin")).toHaveLength(1);expect(service.list(owner,"admin")).toHaveLength(1);});
 it("preserves payment hashes and paid tier across a database reopen",async()=>{
  const directory=mkdtempSync(join(tmpdir(),"bw-payment-test-")),path=join(directory,"bitcoinwalk.sqlite");
  let store=new PaymentStore(path);
  try{const service=new PaymentService(store,{makeInvoice:async()=>invoice,lookupInvoice:async()=>({payment_hash:hash,type:"incoming",amount:21000000,state:"settled",settled_at:now,preimage})},async()=>({cityId,cityName:"Memphis",owner,revisionId}),()=>now);await service.create(owner,cityId,revisionId);await service.reconcile();store.db.close();store=new PaymentStore(path);expect(store.entitled(cityId)).toBe(true);expect(store.rows()[0].paymentHash).toBe(hash);expect(store.rows()[0].status).toBe("paid");}finally{store.db.close();rmSync(directory,{recursive:true});}
 });
});
describe("payment request authorization",()=>{
 it("binds request to the deployment origin and short lifetime",()=>{const event=finalizeEvent(paymentRequest({action:"status",cityId},"https://app-staging.bitcoinwalk.org",now),generateSecretKey());expect(authorizePayment(event,"https://app-staging.bitcoinwalk.org",now).action).toBe("status");expect(()=>authorizePayment(event,"https://bitcoinwalk.org",now)).toThrow();expect(()=>authorizePayment(event,"https://app-staging.bitcoinwalk.org",now+301)).toThrow();});
 it("rejects tampering and client-supplied price",()=>{const event=finalizeEvent(paymentRequest({action:"list"},"https://example.org",now),generateSecretKey());expect(()=>authorizePayment({...event,content:'{"action":"list","amount":1}'},"https://example.org",now)).toThrow();});
});

