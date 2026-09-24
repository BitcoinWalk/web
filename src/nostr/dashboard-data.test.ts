import {beforeEach,describe,expect,it,vi} from "vitest";
import {dashboardCities,latestDashboardGrants,loadDashboardSummary,upcomingPreview} from "./dashboard-data";
import {queryAuthorizations,queryDirectoryRecords,queryCalendarEvents,type AuthorizationRecord} from "./city-records";
import {queryHostedWalks} from "./hosted-walks";
import {approvedCalendarWalks} from "./calendar-records";
import type {HostedWalk} from "./hosted-walks";
import {managedCalendarEvents} from "../domain/event-routing";
vi.mock("./city-records",()=>({queryAuthorizations:vi.fn(),queryDirectoryRecords:vi.fn(),queryCalendarEvents:vi.fn(),pendingCityRevisions:vi.fn(()=>[])}));
vi.mock("./hosted-walks",()=>({queryHostedWalks:vi.fn()}));
vi.mock("./calendar-records",()=>({approvedCalendarWalks:vi.fn(()=>[])}));
vi.mock("../domain/event-routing",()=>({managedCalendarEvents:vi.fn(()=>[{event:{id:"event"},start:100,status:"upcoming"},{event:{id:"past"},start:1,status:"past"}])}));
vi.mock("./authority",()=>({isSuperAdmin:(key:string)=>key==="admin"}));
const grant=(time:number,editors:string[]):AuthorizationRecord=>({event:{id:String(time),created_at:time},grant:{cityId:"city",creatorPubkey:"owner",editorPubkeys:editors}} as AuthorizationRecord);
beforeEach(()=>{vi.clearAllMocks();vi.mocked(queryAuthorizations).mockResolvedValue([]);vi.mocked(queryDirectoryRecords).mockResolvedValue({revisions:[],approvals:[]});vi.mocked(queryHostedWalks).mockResolvedValue([]);vi.mocked(queryCalendarEvents).mockResolvedValue([]);vi.mocked(approvedCalendarWalks).mockReturnValue([]);});
describe("shared dashboard data",()=>{
 it("marks a city unscheduled only after a successful calendar read",async()=>{
  vi.mocked(approvedCalendarWalks).mockReturnValue([{revision:{city:{cityId:"a",cityName:"Austin"}}}] as never);
  vi.mocked(managedCalendarEvents).mockReturnValueOnce([]);
  const result=await loadDashboardSummary(["wss://relay"],"admin","");
  expect(result.unscheduled).toEqual([{id:"a",name:"Austin"}]);expect(result.nextWalks).toEqual([]);
 });
 it("does not expose city schedules to an unrelated identity",async()=>{
  vi.mocked(approvedCalendarWalks).mockReturnValue([{revision:{city:{cityId:"a",cityName:"Austin"}}}] as never);
  const result=await loadDashboardSummary(["wss://relay"],"stranger","");
  expect(result.nextWalks).toEqual([]);expect(result.unscheduled).toEqual([]);expect(queryCalendarEvents).not.toHaveBeenCalled();
 });
 it("sorts, deduplicates and bounds upcoming previews without including past walks",()=>{
  const make=(id:string,start:number,status:string)=>({item:{event:{id},start,status}} as HostedWalk);
  const rows=[make("later",30,"upcoming"),make("past",1,"past"),make("now",10,"active"),make("now",10,"active"),make("next",20,"upcoming")];
  expect(upcomingPreview(rows,2).map(h=>h.item.event.id)).toEqual(["now","next"]);
 });
 it("uses only the latest city grant when an editor was removed",()=>{
  const records=[grant(1,["editor"]),grant(2,[])];
  expect(latestDashboardGrants(records)).toEqual([records[1]]);
  expect(dashboardCities("editor",records,[],[])).toEqual([]);
 });
 it("includes accepted hosting cities without granting editing access",()=>{
  const hosted=[{walk:{revision:{city:{cityId:"host-city",cityName:"Host city"}}},item:{event:{id:"host"},start:100,status:"upcoming"}}] as never;
  expect(dashboardCities("host",[],[],hosted)).toEqual([{id:"host-city",name:"Host city"}]);
 });
 it("omits the two permission-test cities from the dashboard selector",()=>{
  const hosted=["Organizers permission test","Protected Editor Isolation Test","Memphis"].map((name,index)=>({walk:{revision:{city:{cityId:String(index),cityName:name}}},item:{event:{id:String(index)},start:100,status:"upcoming"}})) as never;
  expect(dashboardCities("host",[],[],hosted)).toEqual([{id:"2",name:"Memphis"}]);
 });
 it("returns zero only after successful empty reads",async()=>{
  const result=await loadDashboardSummary(["wss://relay"],"admin","");
  expect([result.cities.value,result.walks.value,result.hosting.value,result.pending.value]).toEqual([0,0,0,0]);
 });
 it("reports failed directory reads without hiding successful hosting data",async()=>{
  vi.mocked(queryDirectoryRecords).mockRejectedValueOnce(new Error("relay offline"));
  const result=await loadDashboardSummary(["wss://relay"],"admin","");
  expect(result.cities.value).toBeNull();expect(result.walks.error).toBe("relay offline");expect(result.pending.value).toBeNull();expect(result.hosting.value).toBe(0);
  expect(result.unscheduled).toBeNull();expect(result.nextWalks).toBeNull();expect(result.nextHosting).toEqual([]);
 });
 it("filters both walk and hosting totals to the selected city",async()=>{
  vi.mocked(approvedCalendarWalks).mockReturnValue([{revision:{city:{cityId:"a"}}},{revision:{city:{cityId:"b"}}}] as never);
  vi.mocked(queryHostedWalks).mockResolvedValue([{walk:{revision:{city:{cityId:"a"}}},item:{event:{id:"a"},start:100,status:"upcoming"}},{walk:{revision:{city:{cityId:"b"}}},item:{event:{id:"b"},start:200,status:"upcoming"}}] as never);
  const result=await loadDashboardSummary(["wss://relay"],"admin","b");
  expect(result.cities.value).toBe(1);expect(result.walks.value).toBe(1);expect(result.hosting.value).toBe(1);
  expect(result.nextWalks?.map(h=>h.walk.revision.city.cityId)).toEqual(["b"]);
  expect(result.nextHosting?.map(h=>h.walk.revision.city.cityId)).toEqual(["b"]);
  expect(queryCalendarEvents).toHaveBeenCalledExactlyOnceWith(["wss://relay"],{cityId:"b"});
 });
 it("does not display a truncated calendar read as a complete count",async()=>{
  vi.mocked(approvedCalendarWalks).mockReturnValue([{revision:{city:{cityId:"a"}}}] as never);
  vi.mocked(queryCalendarEvents).mockResolvedValue(Array(500).fill({}));
  const result=await loadDashboardSummary(["wss://relay"],"admin","");
  expect(result.walks.value).toBeNull();expect(result.walks.error).toContain("read limit");
  expect(result.unscheduled).toBeNull();expect(result.nextWalks).toBeNull();
 });
});
