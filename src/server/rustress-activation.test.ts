import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("./pro-setup",()=>({resolveRustressActivationEvidence:vi.fn()}));
import {managedProvisioningStatus,managedReservationPreflightReason,queueManagedProvisioning,reconcileManagedProvisioning} from "./rustress-activation";

const saved={...process.env};
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);});
describe("managed Rustress runtime gates",()=>{
  it("is inert unless explicitly enabled",async()=>{
    delete process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED;
    await expect(queueManagedProvisioning("request")).resolves.toBeUndefined();
    await expect(reconcileManagedProvisioning()).resolves.toBeUndefined();
    expect(managedProvisioningStatus("00000000-0000-4000-8000-000000000001")).toBeNull();
  });
  it("requires a bounded explicit city allow-list before reading credentials",async()=>{
    process.env.BITCOINWALK_RUSTRESS_MANAGED_ENABLED="1";process.env.BITCOINWALK_RUSTRESS_MANAGED_CITIES="";
    await expect(queueManagedProvisioning("request")).rejects.toThrow("allow-list");
    process.env.BITCOINWALK_RUSTRESS_MANAGED_CITIES=Array.from({length:11},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`).join(",");
    await expect(queueManagedProvisioning("request")).rejects.toThrow("allow-list");
  });
  it("reports only a privacy-safe managed reservation preflight category",()=>{
    expect(managedReservationPreflightReason(new Error("City identity read-back is incomplete or superseded."))).toBe("city identity relay read-back is incomplete");
    expect(managedReservationPreflightReason(new Error("Lightning endpoint rejected the request: private provider detail"))).toBe("payout evidence is unavailable");
    expect(managedReservationPreflightReason(new Error("unexpected private detail"))).toBe("authorization evidence is unavailable");
    expect(managedReservationPreflightReason(Object.assign(new Error("private schema detail"),{name:"ZodError"}))).toBe("generated provider configuration is invalid");
    expect(managedReservationPreflightReason(new Error("City ownership, approval or entitlement changed. Prepare a new request."))).toBe("city authority changed after identity approval");
  });
});
