import {createHash} from "node:crypto";
import {encode,sign} from "bolt11";
import {describe,expect,it} from "vitest";
import {validateOutgoingInvoice,type OutgoingTerms} from "./outgoing-invoice";
const now=1800000000,metadata=JSON.stringify([["text/plain","Fixture payout"]]),hash="ab".repeat(32);
const terms:OutgoingTerms={amountMsat:"79000",minMsat:"1000",maxMsat:"1000000",network:"bc",metadata};
function invoice(satoshis=79,timestamp=now,expiry=3600,meta=metadata){return sign(encode({satoshis,timestamp,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(meta).digest("hex")},{tagName:"expire_time",data:expiry}]}),"12".repeat(32)).paymentRequest!;}
describe("outgoing LNURL invoice validation",()=>{
 it("decodes the actual signed amount, hash, metadata commitment and expiry",()=>{
  expect(validateOutgoingInvoice(invoice(),terms,now)).toMatchObject({paymentHash:hash,amountMsat:"79000",expiresAt:now+3600});
 });
 it.each([invoice(78),invoice(80),invoice(79,now,3600,"wrong metadata"),invoice(79,now-4000),invoice(79,now+61),invoice(79,now,86401),invoice(79,now,30),"lnbc1broken"])("rejects invalid or unsafe invoice %# without leaking its content",value=>{
  expect(()=>validateOutgoingInvoice(value,terms,now)).toThrow("Outgoing invoice failed validation");
 });
 it("rejects wrong networks, unsupported recipient range and malformed metadata",()=>{
  for(const changed of [{...terms,network:"tb" as const},{...terms,minMsat:"80000"},{...terms,maxMsat:"78000"},{...terms,metadata:"{}"},{...terms,metadata:'[["image/png","x"]]'}])expect(()=>validateOutgoingInvoice(invoice(),changed,now)).toThrow();
 });
 it("permits an expired invoice only for read-only reconciliation",()=>{
  const value=invoice(79,now-4000);expect(()=>validateOutgoingInvoice(value,terms,now)).toThrow();
  expect(validateOutgoingInvoice(value,terms,now,true).paymentHash).toBe(hash);
 });
 it("does not accept an ordinary description as an LNURL metadata commitment",()=>{
  const value=sign(encode({satoshis:79,timestamp:now,tags:[{tagName:"payment_hash",data:hash},{tagName:"description",data:"Fixture payout"}]}),"12".repeat(32)).paymentRequest!;
  expect(()=>validateOutgoingInvoice(value,terms,now)).toThrow();
 });
 it("rejects amountless invoices and altered checksum/signature bytes",()=>{
  const value=sign(encode({timestamp:now,tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:createHash("sha256").update(metadata).digest("hex")}]}),"12".repeat(32)).paymentRequest!;
  expect(()=>validateOutgoingInvoice(value,terms,now)).toThrow();
  expect(()=>validateOutgoingInvoice(invoice().slice(0,-6)+"qqqqqq",terms,now)).toThrow();
 });
});
