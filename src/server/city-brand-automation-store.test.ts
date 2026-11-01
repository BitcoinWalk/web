import {DatabaseSync} from "node:sqlite";
import {describe,expect,it} from "vitest";
import type {Event} from "nostr-tools";
import {CityBrandAutomationStore} from "./city-brand-automation-store";

const policy={contract:"bitcoinwalk-city-brand-automation-v1" as const,policyRevision:1 as const,environment:"staging" as const,automationPubkey:"a".repeat(64),allowedAction:"activate" as const,maximumCities:1,issuedAt:1,nonce:"00000000-0000-4000-8000-000000000001"};
const event={id:"b".repeat(64)} as Event;
describe("city identity automation audit",()=>{
 it("does not initialize storage while reading in dry-run mode",()=>{
  const db=new DatabaseSync(":memory:"),store=new CityBrandAutomationStore(db,()=>10,false);
  expect(store.get("missing")).toBeUndefined();
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='city_brand_automation_audit'").get()).toBeUndefined();
 });
 it("retains exact outcomes and enforces the policy city limit",()=>{
  const db=new DatabaseSync(":memory:"),store=new CityBrandAutomationStore(db,()=>10);
  store.plan(event,policy,"request-1","city-1");
  expect(store.get("request-1")).toEqual({state:"planned",detail:"eligible"});
  expect(()=>store.plan(event,policy,"request-2","city-2")).toThrow("limit");
  store.record("request-1","approved","exact initial binding approved","c".repeat(64));store.record("request-1","published","exact relay read-back confirmed");
  expect(store.rows()).toEqual([expect.objectContaining({requestId:"request-1",cityId:"city-1",state:"published",eventId:"c".repeat(64)})]);
  expect(()=>store.plan(event,policy,"request-2","city-2")).toThrow("limit");
  store.plan(event,policy,"request-1","city-1");
 });
});
