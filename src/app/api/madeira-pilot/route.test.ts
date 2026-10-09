import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {finalizeEvent} from "nostr-tools";
vi.mock("../../../nostr/madeira-pilot-policy",async original=>{
  const real=await original<typeof import("../../../nostr/madeira-pilot-policy")>();
  return {MADEIRA_PILOT:{...real.MADEIRA_PILOT,pubkey:(await import("nostr-tools")).getPublicKey(new Uint8Array(32).fill(2))}};
});
vi.mock("../../../server/madeira-pilot",()=>({madeiraPilotEnabled:vi.fn(),getMadeiraPilot:vi.fn()}));
vi.mock("../../../server/rustress-activation",()=>({reconcileManagedProvisioning:vi.fn(),managedProvisioningStatus:vi.fn(()=>null)}));
import {madeiraPilotEnabled,getMadeiraPilot} from "../../../server/madeira-pilot";
import {MADEIRA_PILOT,madeiraRequest} from "../../../nostr/madeira-pilot";
import {POST} from "./route";
const runtime={store:{prepare:vi.fn(),view:vi.fn(),accept:vi.fn()},managedStore:{prepare:vi.fn(),view:vi.fn(),accept:vi.fn()},workflow:{status:vi.fn()},reconcile:vi.fn()};
let clock=Date.now();
beforeEach(()=>{vi.clearAllMocks();clock+=10000;vi.spyOn(Date,"now").mockReturnValue(clock);vi.mocked(madeiraPilotEnabled).mockReturnValue(true);vi.mocked(getMadeiraPilot).mockReturnValue(runtime as never);});
afterEach(()=>vi.restoreAllMocks());
function request(action:"load"|"owner"|"retry"="load",origin:string=MADEIRA_PILOT.origin,key=new Uint8Array(32).fill(2)){
  return new Request(`${MADEIRA_PILOT.origin}/api/madeira-pilot`,{method:"POST",headers:{origin},body:JSON.stringify({event:finalizeEvent(madeiraRequest({action}),key)})});
}
it("rejects disabled, cross-origin, unrelated and unsigned requests before accessing private data",async()=>{
  vi.mocked(madeiraPilotEnabled).mockReturnValue(false);expect((await POST(request())).status).toBe(404);
  vi.mocked(madeiraPilotEnabled).mockReturnValue(true);expect((await POST(request("load","https://bitcoinwalk.org"))).status).toBe(403);
  expect((await POST(request("load",MADEIRA_PILOT.origin,new Uint8Array(32).fill(3)))).status).toBe(403);
  expect((await POST(new Request(`${MADEIRA_PILOT.origin}/api/madeira-pilot`,{method:"POST",headers:{origin:MADEIRA_PILOT.origin},body:"{}"}))).status).toBe(403);
  expect(getMadeiraPilot).not.toHaveBeenCalled();
});
it("loads privately without provisioning, prohibits caching and bounds repeated reads",async()=>{
  runtime.store.view.mockReturnValue({ownerConfirmed:false});
  const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(runtime.store.prepare).toHaveBeenCalledOnce();expect(runtime.reconcile).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(429);
});
it("requires an explicit proof and redacts internal errors",async()=>{
  expect((await POST(request("owner"))).status).toBe(409);expect(runtime.store.accept).not.toHaveBeenCalled();
  clock+=10000;vi.spyOn(Date,"now").mockReturnValue(clock);runtime.store.prepare.mockRejectedValueOnce(new Error("SECRET token/database failure"));
  const response=await POST(request());expect(response.status).toBe(409);expect(JSON.stringify(await response.json())).not.toContain("SECRET");
});
