import {describe,expect,it} from "vitest";
import {resolvePublicCityPayment} from "./public-city-payment";

const cityId="00000000-0000-4000-8000-000000000001",brand="3".repeat(64),host={state:"brand" as const,pubkey:brand,name:"BitcoinWalk in Madeira"};
const config={cityId,version:2,domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:brand,authorityEventId:"1".repeat(64),approvalEventId:"2".repeat(64),brandEventId:"3".repeat(64),payoutVersion:1,payoutDestination:"organizer@example.org",walletRef:"bitcoinwalk-rustress",organizerBasisPoints:7900,retainedBasisPoints:2100,invoiceIssuance:"enabled"};

describe("public city payment boundary",()=>{
 it("routes Basic cities only to BitcoinWalk HQ",async()=>{const action=await resolvePublicCityPayment(cityId,"memphis",{state:"personal",pubkey:"4".repeat(64)},{entitled:()=>false,activation:()=>undefined});expect(action).toEqual({kind:"donate",href:"lightning:donate@bitcoinwalk.org"});});
 it("exposes Zap the host for the exact active Pro city binding after payment-record migration",async()=>{const action=await resolvePublicCityPayment(cityId,"madeira",host,{entitled:()=>false,activation:()=>({phase:"active",lnurl:"active",activation_config:JSON.stringify(config)})});expect(action).toEqual({kind:"zap",href:"lightning:madeira@bitcoinwalk.org"});});
 it("uses the signed Pro brand binding for a city predating the local activation ledger",async()=>{const action=await resolvePublicCityPayment(cityId,"madeira",host,{entitled:()=>false,activation:()=>undefined});expect(action).toEqual({kind:"zap",href:"lightning:madeira@bitcoinwalk.org"});});
 it("preserves migrated Pro presentation after a temporary staging activation window closes",async()=>{const action=await resolvePublicCityPayment(cityId,"madeira",host,{entitled:()=>true,activation:()=>({phase:"needs-attention",lnurl:"needs-attention",activation_config:JSON.stringify(config)})});expect(action).toEqual({kind:"zap",href:"lightning:madeira@bitcoinwalk.org"});});
 it("falls through from a legacy active payload to signed branded-city authority",async()=>{const action=await resolvePublicCityPayment(cityId,"madeira",host,{entitled:()=>true,activation:()=>({phase:"active",lnurl:"active",activation_config:JSON.stringify({legacy:true})})});expect(action).toEqual({kind:"zap",href:"lightning:madeira@bitcoinwalk.org"});});
 it("fails closed for a paid entitlement without a public brand binding",async()=>{const action=await resolvePublicCityPayment(cityId,"madeira",{state:"personal",pubkey:"4".repeat(64)},{entitled:()=>true,activation:()=>undefined});expect(action.kind).toBe("unavailable");});
 it.each([
  {title:"brand mismatch",phase:"active",lnurl:"active",pubkey:"5".repeat(64)},
 ])("fails safely for $title",async value=>{const action=await resolvePublicCityPayment(cityId,"madeira",{...host,pubkey:value.pubkey},{entitled:()=>true,activation:()=>({phase:value.phase,lnurl:value.lnurl,activation_config:JSON.stringify(config)})});expect(action.kind).toBe("unavailable");});
});
