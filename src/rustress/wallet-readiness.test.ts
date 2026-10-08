import {describe,expect,it} from "vitest";
import {assessRustressWallet,type WalletReadinessEvidence} from "./wallet-readiness";
import {RUSTRESS_WALLET_REQUIREMENTS} from "./contract";
function evidence():WalletReadinessEvidence{return{
 connectionRef:"rustress-test",checkoutConnectionRef:"checkout",network:"signet",
 inventory:{checkedAt:1000,expiresAt:2000,grantedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],notificationsGranted:true,revoked:false,budgetMsat:100000,remainingBudgetMsat:100000,budgetRenewal:"never",isolated:true},
 protocol:{checkedAt:1000,advertisedMethods:[...RUSTRESS_WALLET_REQUIREMENTS.methods],successfulReadMethods:["get_info","lookup_invoice","list_transactions"]},
 policy:{approvedAt:1000,expiresAt:2000,expectedNetwork:"signet",maximumBudgetMsat:100000,maximumTestPaymentMsat:79000,maximumFeeMsat:1000,feeLimitVerified:true,approvedSharedWallet:false},
};}
describe("Rustress preflight is not live payment authorization",()=>{
 it("only permits consideration of an explicitly authorized test, never live activation",()=>{
  expect(assessRustressWallet(evidence(),1000)).toEqual({state:"ready-for-authorized-test",issues:[],livePaymentsEnabled:false});
 });
 it("rejects missing/untrusted fields and secret-bearing input without echoing it",()=>{
  for(const input of [null,{}, {...evidence(),nwc:"nostr+walletconnect://SECRET"}]){
   const result=assessRustressWallet(input,1000);expect(result.issues).toEqual(["invalid-evidence"]);expect(JSON.stringify(result)).not.toContain("SECRET");
  }
 });
 it("does not confuse advertised methods with granted permissions",()=>{
  const e=evidence();e.inventory.grantedMethods=["make_invoice","lookup_invoice"];
  expect(assessRustressWallet(e,1000).issues).toContain("missing-grants");
 });
 it("preserves the separate receive-only checkout boundary",()=>{
  const e=evidence();e.connectionRef=e.checkoutConnectionRef;expect(assessRustressWallet(e,1000).issues).toContain("checkout-connection-reused");
 });
 it("requires fresh inventory, read probes and unexpired approval",()=>{
  for(const change of [(e:WalletReadinessEvidence)=>{e.inventory.checkedAt=2001;},(e:WalletReadinessEvidence)=>{e.protocol.checkedAt=0;},(e:WalletReadinessEvidence)=>{e.policy.expiresAt=1000;},(e:WalletReadinessEvidence)=>{e.inventory.expiresAt=1000;}]){
   const e=evidence();change(e);expect(assessRustressWallet(e,1000).issues).toContain("stale-evidence");
  }
 });
 it("blocks revocation, wrong network and unapproved broad permissions",()=>{
  const e=evidence();e.inventory.revoked=true;e.network="mainnet";e.inventory.grantedMethods.push("sign_message");
  expect(assessRustressWallet(e,1000).issues).toEqual(expect.arrayContaining(["connection-revoked","network-mismatch","excessive-grants"]));
 });
 it("requires notifications and demonstrated read methods independently of advertising",()=>{
  const e=evidence();e.inventory.notificationsGranted=false;e.protocol.successfulReadMethods=["get_info"];e.protocol.advertisedMethods=[];
  expect(assessRustressWallet(e,1000).issues).toEqual(expect.arrayContaining(["notifications-not-granted","read-probes-incomplete","missing-advertised-methods"]));
 });
 it("requires a bounded non-renewing pilot budget with room for fees",()=>{
  const e=evidence();e.inventory.budgetMsat=200000;e.inventory.remainingBudgetMsat=79000;e.inventory.budgetRenewal="daily";
  expect(assessRustressWallet(e,1000).issues).toEqual(expect.arrayContaining(["budget-exceeds-approval","insufficient-budget","renewing-budget"]));
 });
 it("rejects inconsistent budgets and unverified fee enforcement",()=>{
  const e=evidence();e.inventory.remainingBudgetMsat=100001;e.policy.feeLimitVerified=false;
  expect(assessRustressWallet(e,1000).issues).toEqual(expect.arrayContaining(["budget-inconsistent","fee-limit-unverified"]));
 });
 it("requires explicit approval to use a shared-balance wallet",()=>{
  const e=evidence();e.inventory.isolated=false;expect(assessRustressWallet(e,1000).issues).toContain("shared-wallet-not-approved");
  e.policy.approvedSharedWallet=true;expect(assessRustressWallet(e,1000).state).toBe("ready-for-authorized-test");
 });
 it("rejects fractional, unsafe and unbounded amounts",()=>{
  for(const amount of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]){
   const e=evidence();e.inventory.budgetMsat=amount;expect(assessRustressWallet(e,1000).issues).toEqual(["invalid-evidence"]);
  }
 });
});
