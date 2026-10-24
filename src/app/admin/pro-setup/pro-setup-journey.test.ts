import {describe,expect,it} from "vitest";
import {proSetupJourney,withSavedPayout,payoutErrorMessage} from "./screen";
import type {ProSetupPreview} from "../../../server/pro-setup";

function preview(overrides:Partial<ProSetupPreview>={}):ProSetupPreview{
  return {cityId:"city",cityName:"Madeira",revisionId:"revision",status:"preparation-only",
    profile:{name:"BitcoinWalk in Madeira",display_name:"BitcoinWalk in Madeira",picture:"https://example.com/avatar",banner:"https://example.com/banner",website:"https://bitcoinwalk.org/madeira"},
    payout:{configured:false},setup:{state:"setup-required",updatedAt:1},signer:{configured:false},
    capabilities:{overall:"setup-required",nip05:"setup-required",lightning:"setup-required",retryable:false,detail:"Ready."},
    community:{walkieTalkieActive:false,armadaActive:false,walkieTalkieEnabled:false,armadaEnabled:false},
    steps:[{label:"Pro entitlement and city ownership",state:"ready",detail:"Saved"},{label:"City profile artwork",state:"ready",detail:"Prepared"},{label:"Personal payout destination",state:"blocked",detail:"Add it"},{label:"City signer",state:"blocked",detail:"Connect it"},{label:"NIP-05 identity",state:"blocked",detail:"Pending"},{label:"Lightning address",state:"blocked",detail:"Pending"}],...overrides};
}

describe("Pro setup journey",()=>{
  it("turns provider failures into an actionable explanation without claiming a save",()=>{
    expect(payoutErrorMessage("The payout callback must stay on the destination provider or its reviewed payment service.")).toContain("Contact BitcoinWalk");
    expect(payoutErrorMessage("Lightning endpoint timed out.")).toContain("reload Pro services");
    expect(payoutErrorMessage("Signature rejected")).toBe("Signature rejected");
  });
  it("asks the host for only the first incomplete action",()=>{expect(proSetupJourney(preview())).toMatchObject({mode:"resume",actor:"You",target:"payout",nextTitle:"Confirm the payout destination"});});
  it("advances progress and guides the host to the city identity after payout save",()=>{
    const saved=withSavedPayout(preview(),{destination:"host@example.com",version:1,update:"not-required",message:"Destination saved."});
    expect(saved.steps.find(step=>step.label==="Personal payout destination")).toMatchObject({state:"ready"});
    expect(proSetupJourney(saved)).toMatchObject({completed:3,total:6,target:"signer",nextTitle:"Connect the city identity"});
  });
  it("moves to the saved city identity without creating another account",()=>{expect(proSetupJourney(preview({payout:{configured:true,destination:"host@example.com",version:2}}))).toMatchObject({mode:"resume",target:"signer",nextTitle:"Connect the city identity"});});
  it("hands responsibility to BitcoinWalk after signed proof submission",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},activation:{requestId:"request",expiresAt:2_000_000_000,proofsReady:true,status:"pending"}}),1_000)).toMatchObject({mode:"waiting",actor:"BitcoinWalk",badge:"Awaiting review"});});
  it("ends host setup as soon as BitcoinWalk approves it",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},activation:{requestId:"request",expiresAt:1,proofsReady:true,status:"approved"}}),2_000)).toMatchObject({mode:"complete",title:"Pro setup complete",badge:"Complete",nextDetail:expect.stringContaining("do not need to return")});});
  it("keeps host setup complete after the identity is published",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},activation:{requestId:"request",expiresAt:1,proofsReady:true,status:"active"}}),2_000)).toMatchObject({mode:"complete",title:"Pro setup complete",badge:"Complete"});});
  it("never reopens the organizer wizard for an active identity with an admin-only provisioning warning",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},activation:{requestId:"request",expiresAt:1,proofsReady:true,status:"active"},capabilities:{overall:"needs-attention",nip05:"active",lightning:"active",retryable:true,detail:"Administrator review required."},steps:Array.from({length:6},(_,index)=>({label:`Step ${index+1}`,state:"ready" as const,detail:"Complete"}))}),2_000)).toMatchObject({mode:"complete",title:"Pro setup complete",badge:"Complete",completed:6,total:6});});
  it("switches active cities from setup to management",()=>{expect(proSetupJourney(preview({payout:{configured:true},signer:{configured:true},capabilities:{overall:"active",nip05:"active",lightning:"active",retryable:false,detail:"Verified."}}))).toMatchObject({mode:"manage",title:"Manage Pro",badge:"Active"});});
});
