import {describe,expect,it} from "vitest";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {MAXIMUM_PAYOUT_OPERATION_SECONDS,PAYOUT_OPERATION_CONTRACT,verifyPayoutOperation} from "./payout-operation";

const secret=Buffer.from("15".repeat(32),"hex"),admin=getPublicKey(secret),now=1_800_000_000,cityId="ad8b95c8-8345-459a-b7db-1d1e700a8472";
const expected={admin,release:"0.2.12",binding:"ab".repeat(32),journalServiceId:"ce72e914-5890-4902-8e8c-16fb30d80f11",budgetMsat:"797900000",maximumPayoutMsat:"790000000",maximumFeeMsat:"7900000",cityIds:[cityId]};
function event(changes:Record<string,unknown>={}){const content={contract:PAYOUT_OPERATION_CONTRACT,mode:"continuous",release:expected.release,binding:expected.binding,journalServiceId:expected.journalServiceId,
 budgetMsat:expected.budgetMsat,maximumPayoutMsat:expected.maximumPayoutMsat,maximumFeeMsat:expected.maximumFeeMsat,cityIds:expected.cityIds,notBefore:now-60,expiresAt:now+MAXIMUM_PAYOUT_OPERATION_SECONDS-60,nonce:"1a27d6f4-3cbe-4445-87e2-98607a2c28c9",...changes};
 return finalizeEvent({kind:30312,created_at:now-120,tags:[["d","bitcoinwalk-rustress-payout-operation"],["expiration",String(content.expiresAt)]],content:JSON.stringify(content)},secret);}

describe("continuous payout operation authority",()=>{
 it("survives restart while binding the exact release, wallet, journal, policy and city",()=>{
  const signed=event();expect(verifyPayoutOperation(signed,expected,now)).toMatchObject({mode:"continuous",cityIds:[cityId]});
  expect(verifyPayoutOperation(signed,expected,now+20*24*60*60)).toMatchObject({release:"0.2.12"});
 });
 it.each(["release","binding","journalServiceId","budgetMsat","maximumPayoutMsat","maximumFeeMsat"])("rejects changed %s",field=>{
  expect(()=>verifyPayoutOperation(event(),{...expected,[field]:field==="journalServiceId"?"cc72e914-5890-4902-8e8c-16fb30d80f11":field==="binding"?"cd".repeat(32):"999"},now)).toThrow();
 });
 it("rejects foreign, duplicate and non-canonical city authority",()=>{
  expect(()=>verifyPayoutOperation(event(),{...expected,cityIds:["bd8b95c8-8345-459a-b7db-1d1e700a8472"]},now)).toThrow();
  expect(()=>verifyPayoutOperation(event({cityIds:[cityId,cityId]}),{...expected,cityIds:[cityId,cityId]},now)).toThrow("cities");
  const second="bd8b95c8-8345-459a-b7db-1d1e700a8472";expect(()=>verifyPayoutOperation(event({cityIds:[second,cityId]}),{...expected,cityIds:[second,cityId]},now)).toThrow("cities");
 });
 it("rejects expiry, overlong grants and a signature created too early",()=>{
  expect(()=>verifyPayoutOperation(event(),expected,now+MAXIMUM_PAYOUT_OPERATION_SECONDS)).toThrow();
  expect(()=>verifyPayoutOperation(event({expiresAt:now+MAXIMUM_PAYOUT_OPERATION_SECONDS+1}),expected,now)).toThrow();
  expect(()=>verifyPayoutOperation(event({notBefore:now+1}),expected,now)).toThrow();
  const early=event({notBefore:now+4000});expect(()=>verifyPayoutOperation(early,expected,now+4000)).toThrow();
 });
 it("rejects another signer, altered signature and wrong replaceable key",()=>{
  expect(()=>verifyPayoutOperation(event(),{...expected,admin:"cd".repeat(32)},now)).toThrow();
  expect(()=>verifyPayoutOperation({...event(),sig:"00".repeat(64)},expected,now)).toThrow();
  expect(()=>verifyPayoutOperation({...event(),tags:[["d","other"],["expiration",String(now+100)]]},expected,now)).toThrow();
  expect(()=>verifyPayoutOperation({...event(),tags:[...event().tags,["extra","tag"]]},expected,now)).toThrow();
  expect(()=>verifyPayoutOperation({...event(),tags:[["d","bitcoinwalk-rustress-payout-operation"],["expiration",`0${now+MAXIMUM_PAYOUT_OPERATION_SECONDS-60}`]]},expected,now)).toThrow();
 });
});
