import {afterEach,describe,expect,it,vi} from "vitest";
import {SUPER_ADMIN_PUBKEY} from "../../../../nostr/authority";

afterEach(()=>vi.resetModules());

describe("relay monitoring endpoint",()=>{
 it("denies organizers and anonymous callers",async()=>{
  const {GET}=await import("./route");
  expect((await GET(new Request("http://localhost/api/monitoring/relays"))).status).toBe(403);
  expect((await GET(new Request("http://localhost/api/monitoring/relays",{headers:{"x-bitcoinwalk-dashboard-pubkey":"a".repeat(64)}}))).status).toBe(403);
 });
 it("accepts the configured super-admin without a signed read request",async()=>{
  vi.doMock("../../../../server/relay-monitor-service",()=>({loadRelayMonitorReport:vi.fn().mockResolvedValue({checkedAt:"2026-10-04T12:00:00.000Z",stale:false,relays:[]})}));
  const {GET}=await import("./route");
  const response=await GET(new Request("http://localhost/api/monitoring/relays",{headers:{"x-bitcoinwalk-dashboard-pubkey":SUPER_ADMIN_PUBKEY}}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({stale:false,relays:[]});
 });
});
