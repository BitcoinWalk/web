import {describe,it,expect} from "vitest";
import {sponsorCoverage} from "./sponsor-coverage";
import type {SponsorOrder} from "../payments/sponsor-types";
const sponsor={state:"sponsor" as const,pubkey:"a",logoHash:"approved"};
const occurrence={id:"event-0",address:"walk-0",start:100,end:200};
function order(count=1):SponsorOrder{return {cityId:"city",pubkey:"a",status:"paid",count,needsReview:false,walks:Array.from({length:count},(_,i)=>({id:`event-${i}`,address:`walk-${i}`,start:100,label:"walk"}))} as SponsorOrder;}
describe("purchased sponsor coverage",()=>{
 it.each([1,2,5])("covers exactly %i purchased walks, not the following walk",count=>{const purchase=order(count);for(let i=0;i<count;i++)expect(sponsorCoverage(sponsor,[purchase],"city",{...occurrence,id:`event-${i}`,address:`walk-${i}`},99)).toEqual(sponsor);expect(sponsorCoverage(sponsor,[purchase],"city",{...occurrence,id:`event-${count}`,address:`walk-${count}`},99)).toEqual({state:"empty"});});
 it("removes the module and artwork at the scheduled end, not the start",()=>{expect(sponsorCoverage(sponsor,[order()],"city",occurrence,199)).toEqual(sponsor);expect(sponsorCoverage(sponsor,[order()],"city",occurrence,200)).toEqual({state:"hidden"});});
 it("does not change payment, artwork or historical evidence at expiry",()=>{const orders=[order()],before=JSON.stringify(orders);sponsorCoverage(sponsor,orders,"city",occurrence,201);expect(JSON.stringify(orders)).toBe(before);expect(sponsor.logoHash).toBe("approved");});
 it("does not expand coverage to a revised or moved event",()=>{expect(sponsorCoverage(sponsor,[order()],"city",{...occurrence,id:"replacement"},99)).toEqual({state:"empty"});expect(sponsorCoverage(sponsor,[order()],"city",{...occurrence,start:101},99)).toEqual({state:"empty"});});
 it("keeps review-required payments off public pages",()=>{expect(sponsorCoverage(sponsor,[{...order(),needsReview:true}],"city",occurrence,99)).toEqual({state:"empty"});});
 it("never promotes payment to artwork approval or overrides hidden assignments",()=>{expect(sponsorCoverage({state:"empty"},[order()],"city",occurrence,99)).toEqual({state:"empty"});expect(sponsorCoverage({state:"hidden"},[order()],"city",occurrence,99)).toEqual({state:"hidden"});});
 it("does not advertise a sponsor on a city with no upcoming occurrence",()=>{expect(sponsorCoverage(sponsor,[order()],"city",undefined,99)).toEqual({state:"empty"});});
 it("retains manual assignments until that walk ends",()=>{expect(sponsorCoverage(sponsor,[],"city",occurrence,99)).toEqual(sponsor);expect(sponsorCoverage(sponsor,[],"city",occurrence,201)).toEqual({state:"hidden"});});
});
