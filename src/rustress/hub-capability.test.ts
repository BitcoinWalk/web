import {describe,expect,it} from "vitest";
import {HUB_PAYMENT_SAFETY_CANDIDATE,HUB_PAYMENT_SAFETY_CONTRACT,HUB_PAYMENT_SAFETY_UPSTREAM,requireHubPaymentSafetyCapability} from "./hub-capability";

function info(){return{methods:["pay_invoice"],bitcoinwalk_payment_safety:{
 contract:HUB_PAYMENT_SAFETY_CONTRACT,candidate_revision:HUB_PAYMENT_SAFETY_CANDIDATE,
 upstream_commit:HUB_PAYMENT_SAFETY_UPSTREAM,backend:"ldk",explicit_fee_ceiling:true,
 unknown_outcome_reservation:true,outgoing_lookup_reconciliation:true,
 legacy_failed_quarantine:true,
}};}

describe("authenticated Hub payment-safety binding",()=>{
 it("accepts only the exact reviewed candidate and complete LDK capability",()=>{
  expect(requireHubPaymentSafetyCapability(info())).toMatchObject({backend:"ldk",explicit_fee_ceiling:true});
 });
 it.each([
  ["missing",(v:ReturnType<typeof info>)=>{delete (v as Partial<typeof v>).bitcoinwalk_payment_safety;}],
  ["candidate",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.candidate_revision="00".repeat(32);} ],
  ["upstream",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.upstream_commit="00".repeat(20);} ],
  ["backend",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.backend="lnd";}],
  ["fee ceiling",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.explicit_fee_ceiling=false;}],
  ["unknown outcome",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.unknown_outcome_reservation=false;}],
  ["lookup",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.outgoing_lookup_reconciliation=false;}],
  ["legacy",(v:ReturnType<typeof info>)=>{v.bitcoinwalk_payment_safety.legacy_failed_quarantine=false;}],
 ])("blocks %s mismatch",(_name,change)=>{const value=info();change(value);expect(()=>requireHubPaymentSafetyCapability(value)).toThrow();});
 it("rejects unreviewed extra claims inside the signed capability",()=>{
  const value=info();Object.assign(value.bitcoinwalk_payment_safety,{live_payments_enabled:true});
  expect(()=>requireHubPaymentSafetyCapability(value)).toThrow();
 });
});
