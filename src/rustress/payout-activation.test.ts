import {describe,expect,it} from "vitest";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {PAYOUT_ACTIVATION_CONTRACT,verifyPayoutActivation} from "./payout-activation";
const secret=Buffer.from("12".repeat(32),"hex"),admin=getPublicKey(secret),now=1800000000;
const expected={admin,release:"0.2.0",binding:"ab".repeat(32),journalServiceId:"ce72e914-5890-4902-8e8c-16fb30d80f11",budgetMsat:"797900000",maximumPayoutMsat:"790000000",maximumFeeMsat:"7900000"};
function event(changes:Record<string,unknown>={}){const content={contract:PAYOUT_ACTIVATION_CONTRACT,release:expected.release,binding:expected.binding,journalServiceId:expected.journalServiceId,
 budgetMsat:expected.budgetMsat,maximumPayoutMsat:expected.maximumPayoutMsat,maximumFeeMsat:expected.maximumFeeMsat,notBefore:now-10,expiresAt:now+3600,nonce:"a8f405d8-f72d-4337-a139-d297e607b3e5",...changes};
 return finalizeEvent({kind:30312,created_at:now-20,tags:[["d","bitcoinwalk-rustress-payout"],["expiration",String(content.expiresAt)]],content:JSON.stringify(content)},secret);}
describe("signed payout activation",()=>{
 it("binds one short-lived release, wallet, journal and policy",()=>{expect(verifyPayoutActivation(event(),expected,now)).toMatchObject({release:"0.2.0",budgetMsat:"797900000"});});
 it.each(["release","binding","journalServiceId","budgetMsat","maximumPayoutMsat","maximumFeeMsat","notBefore","expiresAt"])("rejects mismatched %s",field=>{
  const value=field==="notBefore"?now+1:field==="expiresAt"?now+86401:field==="journalServiceId"?"cc72e914-5890-4902-8e8c-16fb30d80f11":field==="binding"?"cd".repeat(32):"999";
  expect(()=>verifyPayoutActivation(event({[field]:value}),expected,now)).toThrow();
 });
 it("rejects the wrong signer, signature, kind and stale grant",()=>{
  expect(()=>verifyPayoutActivation(event(),{...expected,admin:"cd".repeat(32)},now)).toThrow();
  expect(()=>verifyPayoutActivation({...event(),sig:"00".repeat(64)},expected,now)).toThrow();
  expect(()=>verifyPayoutActivation({...event(),kind:1},expected,now)).toThrow();
  expect(()=>verifyPayoutActivation(event(),expected,now+4000)).toThrow();
 });
});
