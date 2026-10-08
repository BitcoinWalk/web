import {afterEach, expect, it, vi} from "vitest";
vi.mock("../payments/runtime",()=>({getPaymentRuntime:vi.fn()}));
vi.mock("./pro-setup",()=>({resolveRustressProvisionEvidence:vi.fn()}));
import {getPaymentRuntime} from "../payments/runtime";
import {queueIsolatedProvisioning, reconcileIsolatedProvisioning} from "./rustress-workflow";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it("does nothing without explicit fixture enablement",async()=>{
  vi.stubEnv("BITCOINWALK_RUSTRESS_FIXTURE_ENABLED","");
  await queueIsolatedProvisioning("request");await reconcileIsolatedProvisioning();
  expect(getPaymentRuntime).not.toHaveBeenCalled();
});
it("requires a bounded city allow-list before opening the database",async()=>{
  vi.stubEnv("BITCOINWALK_RUSTRESS_FIXTURE_ENABLED","1");vi.stubEnv("BITCOINWALK_RUSTRESS_FIXTURE_CITIES","");
  await expect(reconcileIsolatedProvisioning()).rejects.toThrow("allow-list");
  vi.stubEnv("BITCOINWALK_RUSTRESS_FIXTURE_CITIES","*");
  await expect(reconcileIsolatedProvisioning()).rejects.toThrow("allow-list");
  expect(getPaymentRuntime).not.toHaveBeenCalled();
});
it("requires a private token file, never a secret in an environment value",async()=>{
  vi.stubEnv("BITCOINWALK_RUSTRESS_FIXTURE_ENABLED","1");
  vi.stubEnv("BITCOINWALK_RUSTRESS_FIXTURE_CITIES","00000000-0000-4000-8000-000000000001");
  vi.stubEnv("BITCOINWALK_RUSTRESS_TOKEN_FILE","");
  await expect(reconcileIsolatedProvisioning()).rejects.toThrow("token file");
  expect(getPaymentRuntime).not.toHaveBeenCalled();
});
