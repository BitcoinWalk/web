import {describe,expect,it} from "vitest";
import {cityMatchesType,cityWorkflowActions,cityWorkflowNextStep,cityWorkflowRows} from "./city-backlog";
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
 it("filters Basic, managed Pro and own-relay Pro cities into distinct groups",()=>{
  const [basic]=cityWorkflowRows({managed:[managed("b","Basic","approved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(),paidCities:{}});
  const [managedPro]=cityWorkflowRows({managed:[managed("p","Pro","approved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(["p"]),paidCities:{}});
  const [ownRelayPro]=cityWorkflowRows({managed:[managed("o","Own relay","approved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(["o"]),paidCities:{o:{slug:"own-relay",featured:false,subdomainReady:true,relayMode:"migrated"}}});
  expect([basic,managedPro,ownRelayPro].filter(row=>cityMatchesType(row,"basic"))).toEqual([basic]);
  expect([basic,managedPro,ownRelayPro].filter(row=>cityMatchesType(row,"pro-managed"))).toEqual([managedPro]);
  expect([basic,managedPro,ownRelayPro].filter(row=>cityMatchesType(row,"pro-own"))).toEqual([ownRelayPro]);
 });
 it("keeps final application rejection offline rather than awaiting a third party",()=>{
  const row=cityWorkflowRows({managed:[],pending:[],needsChanges:[],rejected:[revision("r","Rejected")],health:[],paidCityIds:new Set(),paidCities:{}})[0];
 expect(row).toMatchObject({status:"offline",online:false});
  expect(cityWorkflowActions(row)).toEqual(["view-decision"]);
 });
 it("exposes only valid actions for each workflow state",()=>{
  const awaiting={revision:revision("w","Waiting"),rejection:{event:{id:"d".repeat(64)},approval:{cityId:"w",cityRevisionId:"a".repeat(64),status:"rejected"}}} as NeedsChangesCity;
  const pending=cityWorkflowRows({managed:[],pending:[revision("p","Pending")],needsChanges:[],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  const waiting=cityWorkflowRows({managed:[],pending:[],needsChanges:[awaiting],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  const online=cityWorkflowRows({managed:[managed("o","Online","approved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  const offline=cityWorkflowRows({managed:[managed("f","Offline","disapproved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  const archived=cityWorkflowRows({managed:[managed("a","Archived","archived")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  const paid=cityWorkflowRows({managed:[managed("x","Paid","approved")],pending:[],needsChanges:[],health:[],paidCityIds:new Set(["x"]),paidCities:{}})[0];
  expect(cityWorkflowActions(pending)).toEqual(["review-request"]);
  expect(cityWorkflowActions(waiting)).toEqual(["review-request","archive"]);
  expect(cityWorkflowActions(online)).toEqual(["open-record","open-public","set-offline","archive"]);
  expect(cityWorkflowActions(offline)).toEqual(["open-record","set-online","archive"]);
  expect(cityWorkflowActions(archived)).toEqual(["open-record","set-online"]);
  expect(cityWorkflowActions(paid)).toEqual(["open-record","open-public","set-offline"]);
 });
 it("names the responsible person and exact next action for waiting rows",()=>{
  const pending=cityWorkflowRows({managed:[],pending:[revision("p","Pending")],needsChanges:[],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  const awaiting={revision:revision("w","Waiting"),rejection:{event:{id:"d".repeat(64)},approval:{cityId:"w",cityRevisionId:"a".repeat(64),status:"rejected",note:"  Add a clearer meeting point.\nThen resubmit.  "}} as NeedsChangesCity["rejection"]};
  const waiting=cityWorkflowRows({managed:[],pending:[],needsChanges:[awaiting],health:[],paidCityIds:new Set(),paidCities:{}})[0];
  expect(cityWorkflowNextStep(pending)).toEqual({owner:"Super-admin",action:"review the city application and accept it, request changes or reject it."});
  expect(cityWorkflowNextStep(waiting)).toEqual({owner:"City host",action:"Add a clearer meeting point. Then resubmit.",helpHref:"https://docs.bitcoinwalk.org/hosts/complete-city-setup/#correct-and-resubmit-a-city-application"});
 });
 it("turns identity health failures into role-specific one-line actions",()=>{
  const health={cityId:"g",cityName:"Graz",slug:"graz",availableInEnvironment:true,tier:"pro" as const,status:"action-required" as const,checkedAt:1,checks:[
   {key:"identity" as const,label:"Dedicated city npub",state:"fail" as const,detail:"Missing."},
   {key:"recovery" as const,label:"Recovery acknowledgement",state:"fail" as const,detail:"Missing."},
  ]};
  const waiting=cityWorkflowRows({managed:[managed("g","Graz","approved")],pending:[],needsChanges:[],health:[health],paidCityIds:new Set(["g"]),paidCities:{}})[0];
  expect(waiting.status).toBe("awaits-change");
  expect(cityWorkflowNextStep(waiting)).toEqual({owner:"City host",action:"connect the dedicated city signer and confirm its recovery method.",helpHref:"https://docs.bitcoinwalk.org/hosts/complete-city-setup/#connect-the-city-identity"});
  expect(cityWorkflowNextStep({...waiting,status:"online"})).toBeNull();
 });
});
