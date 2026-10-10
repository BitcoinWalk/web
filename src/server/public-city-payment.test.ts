import {describe,expect,it} from "vitest";
import {resolvePublicCityPayment} from "./public-city-payment";

const cityId="00000000-0000-4000-8000-000000000001",brand="3".repeat(64),host={state:"brand" as const,pubkey:brand,name:"BitcoinWalk in Madeira"};
const config={cityId,version:2,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:brand,authorityEventId:"1".repeat(64),approvalEventId:"2".repeat(64),brandEventId:"3".repeat(64),payoutVersion:1,payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"enabled"};

describe("public city payment boundary",()=>{
 it("routes Basic cities only to BitcoinWalk HQ",()=>{const action=resolvePublicCityPayment(cityId,{state:"personal",pubkey:"4".repeat(64)},{entitled:()=>false,activation:()=>undefined,lightningEnabled:()=>true});expect(action).toEqual({kind:"donate",href:"lightning:donate@bitcoinwalk.org"});});
 it("exposes Zap the host for the exact active Pro city binding after payment-record migration",()=>{const action=resolvePublicCityPayment(cityId,host,{entitled:()=>false,activation:()=>({phase:"active",lnurl:"active",activation_config:JSON.stringify(config)}),lightningEnabled:()=>true});expect(action).toEqual({kind:"zap",href:"lightning:madeira@bitcoinwalk.org"});});
 it("fails closed for a paid entitlement whose activation has not started",()=>{const action=resolvePublicCityPayment(cityId,host,{entitled:()=>true,activation:()=>undefined,lightningEnabled:()=>true});expect(action.kind).toBe("unavailable");});
 it.each([
  {title:"feature disabled",enabled:false,phase:"active",lnurl:"active",pubkey:brand},
  {title:"activation incomplete",enabled:true,phase:"verifying",lnurl:"active",pubkey:brand},
  {title:"Lightning unverified",enabled:true,phase:"active",lnurl:"needs-attention",pubkey:brand},
  {title:"brand mismatch",enabled:true,phase:"active",lnurl:"active",pubkey:"5".repeat(64)},
 ])("fails safely for $title",value=>{const action=resolvePublicCityPayment(cityId,{...host,pubkey:value.pubkey},{entitled:()=>true,activation:()=>({phase:value.phase,lnurl:value.lnurl,activation_config:JSON.stringify(config)}),lightningEnabled:()=>value.enabled});expect(action.kind).toBe("unavailable");});
});
