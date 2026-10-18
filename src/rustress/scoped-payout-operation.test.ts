import {describe,expect,it} from "vitest";
import {finalizeEvent,getPublicKey} from "nostr-tools";
import {PAYOUT_BUDGET_RENEWAL,SCOPED_PAYOUT_OPERATION_CONTRACT,VERIFIED_PRO_CITY_SCOPE,verifyScopedPayoutOperation,type ScopedPayoutOperationExpected} from "./scoped-payout-operation";

const secret=Buffer.from("16".repeat(32),"hex"),admin=getPublicKey(secret),now=1_800_000_000;
const expected:ScopedPayoutOperationExpected={admin,binding:"ab".repeat(32),journalServiceId:"ce72e914-5890-4902-8e8c-16fb30d80f11",budgetMsat:"797900000",budgetRenewal:PAYOUT_BUDGET_RENEWAL,
 maximumPayoutMsat:"790000000",maximumFeeMsat:"7900000",cityScope:VERIFIED_PRO_CITY_SCOPE,authorityBinding:"cd".repeat(32),maximumCities:100};
function event(changes:Record<string,unknown>={}){const content={contract:SCOPED_PAYOUT_OPERATION_CONTRACT,mode:"continuous",policyRevision:1,binding:expected.binding,
 journalServiceId:expected.journalServiceId,budgetMsat:expected.budgetMsat,budgetRenewal:expected.budgetRenewal,maximumPayoutMsat:expected.maximumPayoutMsat,maximumFeeMsat:expected.maximumFeeMsat,
 cityScope:expected.cityScope,authorityBinding:expected.authorityBinding,maximumCities:expected.maximumCities,issuedAt:now-60,
 nonce:"1a27d6f4-3cbe-4445-87e2-98607a2c28c9",...changes};
 return finalizeEvent({kind:30312,created_at:now-120,tags:[["d","bitcoinwalk-rustress-payout-operation"]],content:JSON.stringify(content)},secret);}

describe("verified-Pro portfolio payout authority",()=>{
 it("binds the enrollment channel, wallet policy, renewal and capacity without calendar expiry",()=>{
  expect(verifyScopedPayoutOperation(event(),expected,now)).toMatchObject({cityScope:VERIFIED_PRO_CITY_SCOPE,maximumCities:100});
 });
 it.each(["binding","journalServiceId","budgetMsat","maximumPayoutMsat","maximumFeeMsat","authorityBinding"])('rejects changed %s',field=>{
  expect(()=>verifyScopedPayoutOperation(event(),{...expected,[field]:field==="journalServiceId"?"cc72e914-5890-4902-8e8c-16fb30d80f11":"ef".repeat(field.includes("Binding")||field==="binding"?32:1)},now)).toThrow();
 });
 it("rejects a broader scope or city capacity",()=>{
  expect(()=>verifyScopedPayoutOperation(event({cityScope:"all-cities"}),expected,now)).toThrow();
  expect(()=>verifyScopedPayoutOperation(event({maximumCities:101}),expected,now)).toThrow();
  expect(()=>verifyScopedPayoutOperation(event(),{...expected,maximumCities:99},now)).toThrow();
 });
 it("rejects foreign signatures and extra tags, but remains valid in the future",()=>{
  expect(verifyScopedPayoutOperation(event(),expected,now+365*86400)).toMatchObject({budgetRenewal:"monthly"});
  expect(()=>verifyScopedPayoutOperation({...event(),sig:"00".repeat(64)},expected,now)).toThrow();
  expect(()=>verifyScopedPayoutOperation({...event(),tags:[...event().tags,["extra","tag"]]},expected,now)).toThrow();
 });
});
