import {describe,expect,it} from "vitest";
import {resolveDashboardMenuCounts} from "./dashboard-menu";
import type {HostedWalk} from "./hosted-walks";

describe("dashboard menu counts",()=>{
 it("does not invent counts for member accounts",async()=>{expect(await resolveDashboardMenuCounts([],"a".repeat(64),"member",[],{revisions:[],approvals:[]},[])).toEqual({cities:null,walks:null});});
 it("deduplicates organizer hosting assignments",async()=>{
  const event={id:"e".repeat(64)} as HostedWalk["item"]["event"];
  const hosted=[{item:{event,status:"upcoming"}} as HostedWalk,{item:{event,status:"upcoming"}} as HostedWalk];
  expect(await resolveDashboardMenuCounts([],"a".repeat(64),"organizer",[],{revisions:[],approvals:[]},hosted)).toEqual({cities:0,walks:1});
 });
 it("fails closed when organizer hosting assignments are unavailable",async()=>{expect(await resolveDashboardMenuCounts([],"a".repeat(64),"organizer",[],{revisions:[],approvals:[]},null)).toEqual({cities:0,walks:null});});
});
