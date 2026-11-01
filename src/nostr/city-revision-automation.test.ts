import {describe,expect,it} from "vitest";
import type {CityAuthorization,CityDocument} from "../domain/city";
import type {Event} from "nostr-tools";
import type {CityRevision} from "./city-records";
import type {ManagedCity} from "./moderation";
import {automatedCityRevisionDecision} from "./city-revision-automation";

const city:CityDocument={cityId:"00000000-0000-4000-8000-000000000001",slug:"madeira",cityName:"Madeira",startAt:"2026-11-07T10:00:00.000Z",description:"Walk",meetingPoint:{description:"Square",latitude:1,longitude:2}};
const event=(id:string,created_at:number,pubkey="a".repeat(64),tags:string[][]=[])=>( {id:id.repeat(64),created_at,pubkey,tags} as unknown as Event);
type Fixture={current:ManagedCity;revision:CityRevision;grant:CityAuthorization;citySuspended:boolean;organizerSuspended:boolean;now:number};
const fixture=(change:Partial<CityDocument>={description:"Updated walk"}):Fixture=>{
 const current={state:"approved",head:"c".repeat(64),revision:{event:event("a",10),city},decision:{event:event("c",11),approval:{cityId:city.cityId,cityRevisionId:"a".repeat(64),status:"approved"}}} as ManagedCity;
 const revision={event:event("b",12,"a".repeat(64),[["e","a".repeat(64),"","previous"]]),city:{...city,...change}};
 return {current,revision,grant:{cityId:city.cityId,creatorPubkey:"a".repeat(64),creatorRevisionId:"a".repeat(64),editorPubkeys:["a".repeat(64)],superAdminPubkey:"f".repeat(64)},citySuspended:false,organizerSuspended:false,now:20};
};

describe("automatic approved-city revisions",()=>{
 it("approves only a direct content edit with a minimal decision",()=>{
  const template=automatedCityRevisionDecision(fixture());
  expect(JSON.parse(template.content)).toEqual({cityId:city.cityId,cityRevisionId:"b".repeat(64),status:"approved",note:"AUTOMATED_CITY_REVISION: approved content-only editor revision"});
  expect(template.created_at).toBe(20);
 });
 it.each([
  ["slug",{slug:"new-madeira"}],
  ["image",{heroImageUrl:"https://example.com/new.webp"}],
  ["aliases",{aliases:["Funchal"]}],
  ["sponsor",{sponsor:{name:"Sponsor",logoUrl:"https://example.com/logo.png"}}],
 ])("keeps %s changes in manual review",(_name,change)=>expect(()=>automatedCityRevisionDecision(fixture(change as Partial<CityDocument>))).toThrow("protected"));
 it("fails closed on stale predecessors, changed editors and suspension",()=>{
  const stale=fixture();stale.revision.event.tags[0][1]="d".repeat(64);expect(()=>automatedCityRevisionDecision(stale)).toThrow("directly follow");
  const editor=fixture();editor.grant.editorPubkeys=[];expect(()=>automatedCityRevisionDecision(editor)).toThrow("authority");
  const suspended=fixture();suspended.citySuspended=true;expect(()=>automatedCityRevisionDecision(suspended)).toThrow("Suspended");
 });
});
