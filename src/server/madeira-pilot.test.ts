import {afterEach,expect,it,vi} from "vitest";
vi.mock("./city-setup-evidence",()=>({citySetupEvidence:{}}));
import {madeiraPilotEnabled,getMadeiraPilot} from "./madeira-pilot";
afterEach(()=>vi.unstubAllEnvs());
it("requires every exact staging boundary before opening any database or token",()=>{
  const env={BITCOINWALK_MADEIRA_PILOT:"private-fixture-v1",BITCOINWALK_PAYMENT_APP_ORIGIN:"https://app-staging.bitcoinwalk.org",BITCOINWALK_PAYMENT_DATABASE:"/var/lib/bitcoinwalk-app-staging/payments.sqlite",BITCOINWALK_SERVER_READ_RELAY:"ws://127.0.0.1:3334"};
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  expect(madeiraPilotEnabled()).toBe(true);
  for(const [key,value] of Object.entries(env)){
    vi.stubEnv(key,"");expect(madeiraPilotEnabled()).toBe(false);expect(()=>getMadeiraPilot()).toThrow("disabled");vi.stubEnv(key,value);
  }
  vi.stubEnv("BITCOINWALK_PAYMENT_APP_ORIGIN","https://bitcoinwalk.org");expect(madeiraPilotEnabled()).toBe(false);
});
