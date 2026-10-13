import {afterEach,describe,expect,it,vi} from "vitest";
import {finalizeEvent,generateSecretKey,getPublicKey} from "nostr-tools";
import {relayMonitorRequest} from "../../../../nostr/relay-monitor-request";

const adminKey=generateSecretKey(),admin=getPublicKey(adminKey),otherKey=generateSecretKey(),origin="https://bitcoinwalk.org";
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});

describe("relay monitoring endpoint",()=>{
 it("rejects anonymous, forged-header, wrong-identity and wrong-action requests",async()=>{
  vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);
  vi.doMock("../../../../nostr/authority",()=>({isSuperAdmin:(value:string)=>value===admin}));
  const {POST}=await import("./route");
  const init=(body:string)=>({method:"POST",headers:{origin,"content-type":"application/json","x-bitcoinwalk-dashboard-pubkey":admin},body});
  expect((await POST(new Request(origin+"/api/monitoring/relays",init("{}")))).status).toBe(403);
  const organizer=finalizeEvent(relayMonitorRequest(origin),otherKey);
  expect((await POST(new Request(origin+"/api/monitoring/relays",init(JSON.stringify({event:organizer}))))).status).toBe(403);
  const wrong=finalizeEvent(relayMonitorRequest("https://app-staging.bitcoinwalk.org"),adminKey);
  expect((await POST(new Request(origin+"/api/monitoring/relays",init(JSON.stringify({event:wrong}))))).status).toBe(403);
 });
 it("accepts a fresh exact super-admin signature",async()=>{
  vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN",origin);
  vi.doMock("../../../../nostr/authority",()=>({isSuperAdmin:(value:string)=>value===admin}));
  vi.doMock("../../../../server/relay-monitor-service",()=>({loadRelayMonitorReport:vi.fn().mockResolvedValue({checkedAt:"2026-10-04T12:00:00.000Z",stale:false,relays:[]})}));
  const {POST}=await import("./route"),event=finalizeEvent(relayMonitorRequest(origin),adminKey);
  const response=await POST(new Request(origin+"/api/monitoring/relays",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({event})}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({stale:false,relays:[]});
 });
});
