import {createHash} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {createPayoutLookup} from "./wallet-lookup";
const preimage="12".repeat(32),hash=createHash("sha256").update(Buffer.from(preimage,"hex")).digest("hex");
const paid={type:"outgoing",state:"settled",payment_hash:hash,amount:79000,fees_paid:100,settled_at:1800000000,preimage};
describe("connection-bound read-only payout lookup",()=>{
 it("binds valid settlement to the configured wallet reference",async()=>{
  const read=vi.fn().mockResolvedValue(paid);
  expect(await createPayoutLookup("fixture",read)(hash)).toEqual({state:"paid",walletRef:"fixture",paymentHash:hash,amountMsat:"79000",feeMsat:"100",preimage});
  expect(read).toHaveBeenCalledWith(hash);
 });
 it.each([{type:"incoming"},{payment_hash:"ab".repeat(32)},{amount:1.5},{amount:Number.MAX_SAFE_INTEGER+1},{fees_paid:-1},{fees_paid:undefined},{settled_at:0},{preimage:"34".repeat(32)}])("rejects untrusted settlement: %j",async patch=>{
  await expect(createPayoutLookup("fixture",async()=>({...paid,...patch}))(hash)).rejects.toThrow(/^Payout lookup could not be verified$/);
 });
 it.each(["pending","failed","unknown"])("keeps %s unresolved",async state=>{
  expect(await createPayoutLookup("fixture",async()=>({...paid,state}))(hash)).toEqual({state:"pending"});
 });
 it("does not query invalid hashes or disclose transport errors",async()=>{
  const read=vi.fn().mockRejectedValue(new Error("secret"));
  await expect(createPayoutLookup("fixture",read)("invalid")).rejects.toThrow();expect(read).not.toHaveBeenCalled();
  await expect(createPayoutLookup("fixture",read)(hash)).rejects.toThrow(/^Payout lookup could not be verified$/);
 });
});
