import {describe,expect,it} from "vitest";
import {cityWorkflowRows} from "./city-backlog";
import type {ManagedCity,NeedsChangesCity} from "../nostr/moderation";
import type {CityRevision} from "../nostr/city-records";

const revision=(cityId:string,cityName:string):CityRevision=>({event:{id:"a".repeat(64),pubkey:"b".repeat(64)} as CityRevision["event"],city:{cityId,cityName,slug:cityName.toLowerCase(),description:"x",startAt:"2026-01-01T00:00:00.000Z",meetingPoint:{description:"x",latitude:0,longitude:0},requestedTier:"free"}});
const managed=(cityId:string,cityName:string,state:ManagedCity["state"]):ManagedCity=>({revision:revision(cityId,cityName),decision:{event:{id:"c".repeat(64)} as ManagedCity["decision"]["event"],approval:{cityId,cityRevisionId:"a".repeat(64),status:state==="approved"?"approved":"revoked"}},head:"c".repeat(64),state});

describe("cityWorkflowRows",()=>{
 it("orders admin work before host work, online and offline cities",()=>{
  const pending=revision("p","Pending"),awaiting={revision:revision("w","Waiting"),rejection:{event:{id:"d".repeat(64)},approval:{cityId:"w",cityRevisionId:"a".repeat(64),status:"rejected"}}} as NeedsChangesCity;
  const rows=cityWorkflowRows({managed:[managed("o","Online","approved"),managed("f","Offline","disapproved")],pending:[pending],needsChanges:[awaiting],health:[],paidCityIds:new Set(),paidCities:{}});
  expect(rows.map(row=>row.status)).toEqual(["action-required","awaits-change","online","offline"]);
 });
 it("labels migrated operator inventory independently from its paid tier",()=>{
  const row=cityWorkflowRows({managed:[managed("l","London","approved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(["l"]),paidCities:{l:{slug:"london",featured:false,subdomainReady:true,relayMode:"migrated"}}})[0];
  expect(row).toMatchObject({tier:"paid",relay:"migrated",online:true});
 });
 it("keeps final application rejection offline rather than awaiting a third party",()=>{
  const row=cityWorkflowRows({managed:[],pending:[],needsChanges:[],rejected:[revision("r","Rejected")],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  expect(row).toMatchObject({status:"offline",online:false});
 });
});
