import {describe,expect,it} from "vitest";
import {proSetupJourney} from "./screen";
import type {ProSetupPreview} from "../../../server/pro-setup";

function preview(overrides:Partial<ProSetupPreview>={}):ProSetupPreview{
  return {cityId:"city",cityName:"Madeira",revisionId:"revision",status:"preparation-only",
    profile:{name:"BitcoinWalk in Madeira",display_name:"BitcoinWalk in Madeira",picture:"https://example.com/avatar",banner:"https://example.com/banner",website:"https://bitcoinwalk.org/madeira"},
    payout:{configured:false},setup:{state:"setup-required",updatedAt:1},signer:{configured:false},
    capabilities:{overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,detail:"Ready."},
    community:{walkieTalkieActive:false,armadaActive:false,walkieTalkieEnabled:false,armadaEnabled:false},
    steps:[{label:"Entitlement",state:"ready",detail:"Saved"},{label:"Payout",state:"blocked",detail:"Add it"},{label:"Signer",state:"blocked",detail:"Connect it"}],...overrides};
}

describe("Pro setup journey",()=>{
  it("asks the host for only the first incomplete action",()=>{expect(proSetupJourney(preview())).toMatchObject({mode:"resume",actor:"You",target:"payout",nextTitle:"Confirm the payout destination"});});
  it("moves to the saved city identity without creating another account",()=>{expect(proSetupJourney(preview({payout:{configured:true,destination:"host@example.com",version:2}}))).toMatchObject({mode:"resume",target:"signer",nextTitle:"Connect the city identity"});});
  it("hands responsibility to BitcoinWalk after signed proof submission",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},activation:{requestId:"request",expiresAt:2_000_000_000,proofsReady:true}}),1_000)).toMatchObject({mode:"waiting",actor:"BitcoinWalk",badge:"Awaiting review"});});
  it("switches active cities from setup to management",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},capabilities:{overall:"active",nip05:"active",lightning:"active",retryable:false,detail:"Verified."}}))).toMatchObject({mode:"manage",title:"Manage Pro",badge:"Active"});});
});
