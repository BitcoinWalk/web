import {describe,expect,it} from "vitest";
import {resolveDashboardMenuCounts,retainKnownDashboardMenuCounts} from "./dashboard-menu";
import type {HostedWalk} from "./hosted-walks";

describe("dashboard menu counts",()=>{
 it("keeps confirmed counts when a later refresh is incomplete",()=>{
  expect(retainKnownDashboardMenuCounts({cities:16,walks:12},{cities:null,walks:null})).toEqual({cities:16,walks:12});
  expect(retainKnownDashboardMenuCounts({cities:16,walks:12},{cities:17,walks:null})).toEqual({cities:17,walks:12});
  expect(retainKnownDashboardMenuCounts({cities:16,walks:12},{cities:0,walks:0})).toEqual({cities:0,walks:0});
 });
 it("uses accepted active hosting assignments as the member walk capability",async()=>{
  const event={id:"e".repeat(64)} as HostedWalk["item"]["event"];
  const hosted=[{item:{event,status:"upcoming"}} as HostedWalk,{item:{event,status:"upcoming"}} as HostedWalk,{item:{event:{id:"p".repeat(64)},status:"past"}} as HostedWalk];
  expect(await resolveDashboardMenuCounts([],"a".repeat(64),"member",[],{revisions:[],approvals:[]},hosted)).toEqual({cities:null,walks:1});
  expect(await resolveDashboardMenuCounts([],"a".repeat(64),"member",[],{revisions:[],approvals:[]},null)).toEqual({cities:null,walks:null});
 });
 it("deduplicates organizer hosting assignments",async()=>{
  const event={id:"e".repeat(64)} as HostedWalk["item"]["event"];
  const hosted=[{item:{event,status:"upcoming"}} as HostedWalk,{item:{event,status:"upcoming"}} as HostedWalk];
  expect(await resolveDashboardMenuCounts([],"a".repeat(64),"organizer",[],{revisions:[],approvals:[]},hosted)).toEqual({cities:0,walks:1});
 });
 it("fails closed when organizer hosting assignments are unavailable",async()=>{expect(await resolveDashboardMenuCounts([],"a".repeat(64),"organizer",[],{revisions:[],approvals:[]},null)).toEqual({cities:0,walks:null});});
});
