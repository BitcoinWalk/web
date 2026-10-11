import {describe,it,expect} from "vitest";
import type {Event} from "nostr-tools";
import type {SponsorOrder} from "../payments/sponsor-types";
import {orderLogoAssignments,orderLogoApproval,restoreOrderWalkOg} from "./sponsor-order-approval";
const order={id:"order",cityId:"city",status:"paid",pubkey:"a".repeat(64),logoHash:"b".repeat(64),needsReview:false,count:2,walks:[{id:"one",address:"first",start:100,label:"First"},{id:"two",address:"second",start:200,label:"Second"}]} as SponsorOrder;
describe("paid order logo approval",()=>{
 it("restores one walk's default OG without removing its sponsor or changing other walks",()=>{
  const sponsorship={...orderLogoAssignments(order,[])[0],website:"https://example.com",startsAt:10,endsAt:300},rows=[{event:{id:"c".repeat(64),created_at:1} as Event,sponsorship}];
  expect(restoreOrderWalkOg(order,"first",rows)).toEqual({...sponsorship,version:2,logoHash:undefined,previousRevisionId:rows[0].event.id});
  expect(rows[0].sponsorship.logoHash).toBe(order.logoHash);
  expect(()=>restoreOrderWalkOg(order,"unrelated",rows)).toThrow();
  expect(()=>restoreOrderWalkOg({...order,logoHash:"f".repeat(64)},"first",rows)).toThrow();
  expect(restoreOrderWalkOg(order,"first",[{...rows[0],sponsorship:{...sponsorship,logoHash:undefined}}])).toBeNull();
 });
 it("creates only the purchased walk assignments, never a city-wide sponsor",()=>{const values=orderLogoAssignments(order,[]);expect(values).toHaveLength(2);expect(values.map(v=>v.scope)).toEqual(order.walks.map(w=>({type:"walk",cityId:"city",address:w.address})));expect(values.every(v=>v.logoHash===order.logoHash&&v.sponsorPubkey===order.pubkey)).toBe(true);});
 it.each([{status:"pending"},{pubkey:null},{logoHash:null},{needsReview:true},{count:5}])("rejects ineligible orders %j",change=>{expect(()=>orderLogoAssignments({...order,...change},[])).toThrow();});
 it("resumes partial approvals without signing completed walks again",()=>{const value=orderLogoAssignments(order,[])[0],rows=[{event:{id:"c".repeat(64),created_at:1} as Event,sponsorship:value}];expect(orderLogoAssignments(order,rows)).toHaveLength(1);expect(orderLogoApproval(order,rows)).toEqual({approved:1,total:2,complete:false});});
 it("does not overwrite a different sponsor or hidden placement",()=>{for(const change of [{sponsorPubkey:"d".repeat(64)},{mode:"hidden" as const,sponsorPubkey:undefined}]){const value={...orderLogoAssignments(order,[])[0],...change};expect(()=>orderLogoAssignments(order,[{event:{id:"e".repeat(64),created_at:1} as Event,sponsorship:value}])).toThrow();}});
 it("requires the exact uploaded hash to count an approval",()=>{const rows=orderLogoAssignments(order,[]).map((sponsorship,i)=>({event:{id:String(i),created_at:i} as Event,sponsorship}));expect(orderLogoApproval(order,rows).complete).toBe(true);expect(orderLogoApproval({...order,logoHash:"f".repeat(64)},rows).complete).toBe(false);});
});
