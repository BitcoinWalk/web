import {describe,expect,it,vi} from "vitest";
import {buildManagedRelayInventory,classifyRelayEvidence,monitorRelays,type RelayCheckEvidence} from "./relay-monitor";

const good:RelayCheckEvidence={dns:"ok",tls:"ok",https:"ok",wss:"ok",nip11:"ok",nip11Name:"BitcoinWalk relay",supportedNips:[1,11,42]};

describe("managed relay monitoring",()=>{
 it("derives and de-duplicates configuration plus replication registry inventory",()=>{
  const inventory=buildManagedRelayInventory({application:["wss://relay-staging.bitcoinwalk.org/"],directory:["wss://directory-staging.bitcoinwalk.org/"],community:["wss://chat.bitcoinwalk.org/"],replication:{version:1,state:"healthy",reconciled:true,cities:[{cityId:"be8514a4-9df0-4159-a517-71f65761cbbe",destination:"wss://replica-staging.bitcoinwalk.org/",state:"healthy",counts:{acknowledged:8}}]}});
  expect(inventory.map(item=>item.url)).toEqual(["wss://chat.bitcoinwalk.org/","wss://directory-staging.bitcoinwalk.org/","wss://relay-staging.bitcoinwalk.org/","wss://replica-staging.bitcoinwalk.org/"]);
  expect(inventory.at(-1)).toMatchObject({purpose:"City replica",environment:"staging",cityId:"be8514a4-9df0-4159-a517-71f65761cbbe",replication:{state:"healthy",reconciled:true}});
 });
 it.each([
  [good,"green"],
  [{...good,nip11:"malformed"},"amber"],
  [{...good,wss:"timeout"},"amber"],
  [{...good,tls:"failed",https:"failed",wss:"failed",nip11:"failed"},"red"],
  [{dns:"unknown",tls:"unknown",https:"unknown",wss:"unknown",nip11:"unknown"},"unknown"],
 ] as const)("classifies bounded evidence without presenting partial results as healthy",(evidence,status)=>expect(classifyRelayEvidence(evidence)).toBe(status));
 it("keeps mixed outage results visible when one relay throws",async()=>{
  const inventory=buildManagedRelayInventory({application:["wss://one.example/","wss://two.example/"],directory:[],community:[]});
  const inspect=vi.fn(async relay=>{if(relay.url.includes("one"))throw new Error("socket details must not leak");return good;});
  const report=await monitorRelays(inventory,{inspect,now:()=>new Date("2026-10-04T12:00:00Z"),concurrency:2});
  expect(report.relays).toHaveLength(2);
  expect(report.relays.map(item=>item.status).sort()).toEqual(["green","unknown"]);
  expect(JSON.stringify(report)).not.toContain("socket details");
 });
 it("downgrades every stale cached result so stale evidence is never green",async()=>{
  const inventory=buildManagedRelayInventory({application:["wss://one.example/"],directory:[],community:[]});
  const report=await monitorRelays(inventory,{inspect:async()=>good,now:()=>new Date("2026-10-04T12:00:00Z")});
  const stale={...report,checkedAt:"2026-10-04T11:55:00.000Z"};
  const {staleRelayReport}=await import("./relay-monitor");
  expect(staleRelayReport(stale,new Date("2026-10-04T12:00:00Z"),60_000).relays[0].status).toBe("unknown");
 });
});
