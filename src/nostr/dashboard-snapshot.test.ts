import {describe,expect,it} from "vitest";
import type {DashboardSession} from "../components/dashboard-context";
import {organizerDirectorySnapshot} from "./dashboard-snapshot";

const session:DashboardSession={pubkey:"a".repeat(64),role:"organizer",cityCount:1,cities:[],selectedCity:"",grants:[{event:{id:"grant"},grant:{cityId:"city"}}] as never,directory:{revisions:[{event:{id:"revision"},city:{cityId:"city"}}] as never,approvals:[]}};
describe("dashboard relay snapshot",()=>{
 it("reuses a complete snapshot only for the connected identity",()=>{
  expect(organizerDirectorySnapshot(session,session.pubkey)?.revisions).toBe(session.directory?.revisions);
  expect(organizerDirectorySnapshot(session,"b".repeat(64))).toBeNull();
  expect(organizerDirectorySnapshot({...session,directory:null},session.pubkey)).toBeNull();
 });
});
