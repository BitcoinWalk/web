import {describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";

const key=generateSecretKey(),pubkey=getPublicKey(key),origin="https://bitcoinwalk.org",now=2_000_000_000;
vi.mock("./authority",()=>({isSuperAdmin:(value:string)=>value===pubkey}));

describe("relay monitoring authorization",()=>{
 it("binds a fresh admin signature to the exact endpoint and method",async()=>{
  const {authorizeRelayMonitor,relayMonitorRequest}=await import("./relay-monitor-request"),event=finalizeEvent(relayMonitorRequest(origin,now),key);
  expect(authorizeRelayMonitor(event,origin,now)).toBe(pubkey);
  expect(()=>authorizeRelayMonitor(event,"https://app-staging.bitcoinwalk.org",now)).toThrow();
  expect(()=>authorizeRelayMonitor(event,origin,now+301)).toThrow();
  expect(()=>authorizeRelayMonitor({...event,tags:event.tags.map(tag=>tag[0]==="method"?["method","GET"]:tag)},origin,now)).toThrow();
 });
});
