import {createHash} from "node:crypto";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {finalizeEvent,getPublicKey,nip44,type Event} from "nostr-tools";
const mock=vi.hoisted(()=>({reply:undefined as ((event:Event)=>void)|undefined,publish:vi.fn(),connect:vi.fn(),close:vi.fn(),subclose:vi.fn()}));
vi.mock("nostr-tools/relay",()=>({Relay:class{
 connect=mock.connect;close=mock.close;
 subscribe(_filter:unknown,handlers:{onevent:(e:Event)=>void;oneose?:()=>void}){mock.reply=handlers.onevent;queueMicrotask(()=>handlers.oneose?.());return {close:mock.subclose};}
 publish=mock.publish;
}}));
import {RustressNwcReader} from "./nwc-reader";
import {PrivateNwcPaymentNotifications,PrivateNwcReadProbe,PrivateNwcTransport,supportsPaymentReceivedNotification} from "./nwc-transport";
import {RustressNwcWallet,type WalletSendPermit} from "./nwc-wallet";
import {encode,sign} from "bolt11";
const wallet=Buffer.from("23".repeat(32),"hex"),client=Buffer.from("12".repeat(32),"hex"),checkout=Buffer.from("34".repeat(32),"hex");
const walletKey=getPublicKey(wallet),clientKey=getPublicKey(client),key=nip44.getConversationKey(wallet,clientKey);
const uri=(secret:Uint8Array)=>`nostr+walletconnect://${walletKey}?relay=wss://fixture.example&secret=${Buffer.from(secret).toString("hex")}`;
const reader=()=>new RustressNwcReader("fixture",uri(client),uri(checkout));
function reply(request:Event,result:unknown,method="lookup_invoice",patch:Partial<Event>={}){
 return finalizeEvent({kind:23195,created_at:request.created_at,tags:[["e",request.id],["p",clientKey],["encryption","nip44_v2"]],content:nip44.encrypt(JSON.stringify({result_type:method,result}),key),...patch},wallet);
}
beforeEach(()=>{vi.useFakeTimers();mock.publish.mockReset().mockResolvedValue("ok");mock.connect.mockReset().mockResolvedValue(undefined);mock.close.mockClear();mock.subclose.mockClear();});
afterEach(()=>vi.useRealTimers());
describe("default-off real NWC payout adapter",()=>{
 const now=1800000000,preimage="56".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
 const invoice=sign(encode({millisatoshis:"79000",timestamp:now,tags:[{tagName:"payment_hash",data:hash},{tagName:"description",data:"synthetic"},{tagName:"expire_time",data:3600}]}),"67".repeat(32)).paymentRequest!;
 const input={invoice,maximumFeeMsat:"10000",paymentHash:hash};
 function fixture(){
  let enabled=true,time=now;
  const permit=vi.fn(async(r:{binding:string;paymentHash:string;amountMsat:string}):Promise<WalletSendPermit>=>({binding:r.binding,paymentHash:r.paymentHash,amountMsat:r.amountMsat,enforcedFeeCeilingMsat:"10000",checkedAt:now,expiresAt:now+60,authorized:true}));
  const w=new RustressNwcWallet("fixture",uri(client),uri(checkout),"bc",permit,()=>enabled,()=>time);
  mock.publish.mockImplementation(async(event:Event)=>{const body=JSON.parse(nip44.decrypt(event.content,key));
   expect(body).toEqual({method:"pay_invoice",params:{invoice}});mock.reply?.(reply(event,{preimage},"pay_invoice"));return "ok";});
  return {w,permit,disable:()=>{enabled=false;},expire:()=>{time+=100;}};
 }
 it("does not connect or publish by default",async()=>{
  const w=new RustressNwcWallet("fixture",uri(client),uri(checkout),"bc");
  await expect(w.send(input)).rejects.toThrow("unconfirmed");expect(mock.connect).not.toHaveBeenCalled();
 });
 it("publishes one authenticated payment request with no invented fee parameter",async()=>{
  const f=fixture();await f.w.send(input);await expect(f.w.send(input)).rejects.toThrow("unconfirmed");expect(mock.publish).toHaveBeenCalledTimes(1);
 });
 it.each(["binding","hash","amount","fee","stale","expired"])("blocks invalid %s evidence before networking",async mode=>{
  const f=fixture();f.permit.mockImplementation(async r=>({binding:mode==="binding"?"wrong":r.binding,paymentHash:mode==="hash"?"wrong":r.paymentHash,amountMsat:mode==="amount"?"1":r.amountMsat,enforcedFeeCeilingMsat:mode==="fee"?"10001":"10000",checkedAt:mode==="stale"?now-31:now,expiresAt:mode==="expired"?now:now+60,authorized:true}));
  await expect(f.w.send(input)).rejects.toThrow("unconfirmed");expect(mock.connect).not.toHaveBeenCalled();
 });
 it.each(["disable","expire"])("rechecks %s after connecting and before publishing",async mode=>{
  const f=fixture();mock.connect.mockImplementation(async()=>{if(mode==="disable")f.disable();else f.expire();});
  await expect(f.w.send(input)).rejects.toThrow("unconfirmed");expect(mock.publish).not.toHaveBeenCalled();
 });
 it("does not retry after an uncertain publish",async()=>{
  const f=fixture();mock.publish.mockRejectedValue(new Error("private wallet detail"));
  await expect(f.w.send(input)).rejects.toThrow(/^Payment outcome unconfirmed; reconcile before any further action$/);
  await expect(f.w.send(input)).rejects.toThrow("unconfirmed");expect(mock.publish).toHaveBeenCalledTimes(1);
 });
 it("rejects forged settlement preimage",async()=>{
  const f=fixture();mock.publish.mockImplementation(async(event:Event)=>{mock.reply?.(reply(event,{preimage:"00".repeat(32)},"pay_invoice"));return "ok";});
  await expect(f.w.send(input)).rejects.toThrow("unconfirmed");
 });
});
describe("isolated authenticated read-only NWC integration",()=>{
 it("accepts only a signed connection-bound incoming payment hint",async()=>{
  let enabled=true;const hints:string[]=[];const source=new PrivateNwcPaymentNotifications(uri(client)),handle=await source.start(hash=>hints.push(hash),vi.fn(),()=>enabled);
  const hash="ab".repeat(32),event=finalizeEvent({kind:23197,created_at:Math.floor(Date.now()/1000),tags:[["p",clientKey]],content:nip44.encrypt(JSON.stringify({notification_type:"payment_received",notification:{type:"incoming",payment_hash:hash,amount:100000}}),key)},wallet);
  mock.reply?.({...event,sig:"00".repeat(64)});mock.reply?.(finalizeEvent({...event,tags:[["p",walletKey]]},wallet));await Promise.resolve();expect(hints).toEqual([]);
  mock.reply?.(event);await Promise.resolve();await Promise.resolve();expect(hints).toEqual([hash]);enabled=false;mock.reply?.(event);await Promise.resolve();expect(hints).toHaveLength(1);handle.close();
 });
 it("recognizes only an exact signed payment-received capability",()=>{
  const event=finalizeEvent({kind:13194,created_at:1800000000,tags:[["notifications","payment_received payment_sent"]],content:"notifications"},wallet);
  expect(supportsPaymentReceivedNotification(event,walletKey)).toBe(true);
  expect(supportsPaymentReceivedNotification({...event,sig:"00".repeat(64)},walletKey)).toBe(false);
  expect(supportsPaymentReceivedNotification(event,clientKey)).toBe(false);
  expect(supportsPaymentReceivedNotification(finalizeEvent({...event,tags:[["notifications","payment_sent"]]},wallet),walletKey)).toBe(false);
 });
 it("binds a one-shot invoice creation response to the exact request",async()=>{
  const transport=new PrivateNwcTransport("fixture",uri(client),uri(checkout));
  mock.publish.mockImplementation(async(event:Event)=>{const body=JSON.parse(nip44.decrypt(event.content,key));
   expect(body).toEqual({method:"make_invoice",params:{amount:1000,description:"unpaid acceptance",expiry:300}});
   mock.reply?.(reply(event,{type:"incoming",state:"pending",payment_hash:"ab".repeat(32),amount:1000},"make_invoice"));return "ok";});
  expect(await transport.call("make_invoice",{amount:1000,description:"unpaid acceptance",expiry:300})).toMatchObject({state:"pending",amount:1000});
 });
 it("bootstraps only info and bounded history without a checkout credential",async()=>{
  mock.publish.mockImplementation(async(event:Event)=>{const body=JSON.parse(nip44.decrypt(event.content,key));
   mock.reply?.(reply(event,body.method==="get_info"?{network:"mainnet",methods:["get_info","list_transactions"]}:{transactions:[]},body.method));return "ok";});
  const probe=new PrivateNwcReadProbe("fixture",uri(client));
  expect(await probe.getInfo()).toMatchObject({network:"mainnet"});
  expect(await probe.listTransactions()).toEqual({transactions:[]});
  expect("lookupInvoice" in probe).toBe(false);expect("send" in probe).toBe(false);
 });
 it("decrypts only an exact wallet/request-bound response",async()=>{
  mock.publish.mockImplementation(async(event:Event)=>{
   expect(JSON.parse(nip44.decrypt(event.content,key))).toEqual({method:"lookup_invoice",params:{payment_hash:"ab".repeat(32)}});
   mock.reply?.(reply(event,{payment_hash:"ab".repeat(32)}));return "ok";
  });
  expect(await reader().lookupInvoice("ab".repeat(32))).toEqual({payment_hash:"ab".repeat(32)});
  expect(mock.close).toHaveBeenCalled();expect(mock.subclose).toHaveBeenCalled();
 });
 it.each(["author","signature","request","recipient","kind","old","future","encryption","duplicate-tag"])("ignores a %s mismatch before accepting a valid reply",async mode=>{
  mock.publish.mockImplementation(async(event:Event)=>{
   let invalid=reply(event,{bad:true});
   if(mode==="author")invalid={...invalid,pubkey:clientKey};
   if(mode==="signature")invalid={...invalid,sig:"00".repeat(64)};
   if(mode==="request")invalid=reply(event,{},"lookup_invoice",{tags:[["e","ab".repeat(32)],["p",clientKey]]});
   if(mode==="recipient")invalid=reply(event,{},"lookup_invoice",{tags:[["e",event.id],["p",walletKey]]});
   if(mode==="kind")invalid=reply(event,{},"lookup_invoice",{kind:1});
   if(mode==="old")invalid=reply(event,{},"lookup_invoice",{created_at:event.created_at-60});
   if(mode==="future")invalid=reply(event,{},"lookup_invoice",{created_at:event.created_at+60});
   if(mode==="encryption")invalid=reply(event,{},"lookup_invoice",{tags:[["e",event.id],["p",clientKey],["encryption","nip04"]]});
   if(mode==="duplicate-tag")invalid=reply(event,{},"lookup_invoice",{tags:[["e",event.id],["e",event.id],["p",clientKey]]});
   mock.reply?.(invalid);mock.reply?.(reply(event,{good:true}));return "ok";
  });
  expect(await reader().lookupInvoice("ab".repeat(32))).toEqual({good:true});
 });
 it("integrates authenticated lookup with preimage verification",async()=>{
  const preimage="56".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
  mock.publish.mockImplementation(async(event:Event)=>{mock.reply?.(reply(event,{type:"outgoing",state:"settled",payment_hash:hash,amount:79000,fees_paid:100,settled_at:1800000000,preimage}));return "ok";});
  expect(await reader().lookupPayout(hash)).toMatchObject({state:"paid",walletRef:"fixture",paymentHash:hash,amountMsat:"79000"});
 });
 it("exposes bounded history and info reads, not sending",async()=>{
  mock.publish.mockImplementation(async(event:Event)=>{const body=JSON.parse(nip44.decrypt(event.content,key));mock.reply?.(reply(event,body.params,body.method));return "ok";});
  const r=reader();expect(await r.getInfo()).toEqual({});expect(await r.listTransactions(100,50)).toEqual({offset:100,limit:50});
  expect(()=>r.listTransactions(-1)).toThrow();expect(()=>r.listTransactions(0,101)).toThrow();
  expect("send" in r).toBe(false);expect("makeInvoice" in r).toBe(false);
 });
 it("requests unpaid outgoing transactions explicitly for recovery",async()=>{
  mock.publish.mockImplementation(async(event:Event)=>{const body=JSON.parse(nip44.decrypt(event.content,key));
   expect(body).toEqual({method:"list_transactions",params:{offset:50,limit:50,type:"outgoing",unpaid:true}});
   mock.reply?.(reply(event,{transactions:[],total_count:0},body.method));return "ok";});
  const r=reader();expect(await r.listRecoveryTransactions(50,50)).toEqual({transactions:[],total_count:0});
  expect(()=>r.listRecoveryTransactions(0,51)).toThrow();
 });
 it("does not reuse checkout credentials, even with a different label",()=>{
  expect(()=>new RustressNwcReader("different",uri(client),uri(client))).toThrow("Separate");
  expect(()=>new RustressNwcReader("different",uri(client),{clientPubkey:clientKey})).toThrow("Separate");
  expect(new RustressNwcReader("fixture",uri(client),{clientPubkey:getPublicKey(checkout)}).binding).toHaveLength(64);
  const r=reader();expect(r.binding).toHaveLength(64);expect(JSON.stringify(r)).not.toContain(Buffer.from(client).toString("hex"));
 });
 it("rejects invalid configuration without disclosing credentials",()=>{
  for(const value of ["secret",uri(client).replace("wss:","ws:"),uri(client)+"&secret=bad"])
   expect(()=>new RustressNwcReader("fixture",value,uri(checkout))).toThrow(/^Invalid private wallet configuration$/);
 });
 it("times out, closes resources and does not republish",async()=>{
  const result=reader().lookupInvoice("ab".repeat(32));const rejected=expect(result).rejects.toThrow(/^Wallet read could not be verified$/);
  await vi.advanceTimersByTimeAsync(16000);await rejected;expect(mock.publish).toHaveBeenCalledTimes(1);expect(mock.subclose).toHaveBeenCalled();expect(mock.close).toHaveBeenCalled();
 });
 it("rejects wrong result types and raw wallet errors without disclosure",async()=>{
  mock.publish.mockImplementation(async(event:Event)=>{mock.reply?.(reply(event,{secret:"hidden"},"pay_invoice"));return "ok";});
  await expect(reader().getInfo()).rejects.toThrow(/^Wallet read could not be verified$/);
 });
});
