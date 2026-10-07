import {describe,expect,it} from "vitest";
import {isApprovedLogoRoot,isApprovedPaymentDatabase} from "./app-storage";

describe("application storage boundaries",()=>{
  it("accepts isolated staging and production payment databases",()=>{
    expect(isApprovedPaymentDatabase("/var/lib/bitcoinwalk-app-staging/payments.sqlite")).toBe(true);
    expect(isApprovedPaymentDatabase("/var/lib/bitcoinwalk-app-production/payments.sqlite")).toBe(true);
    expect(isApprovedPaymentDatabase("/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite")).toBe(true);
  });

  it("rejects sibling and ambiguous payment paths",()=>{
    expect(isApprovedPaymentDatabase("/var/lib/bitcoinwalk-app-staging-evil/payments.sqlite")).toBe(false);
    expect(isApprovedPaymentDatabase("/home/bitcoinwalk/.local/state/bitcoinwalk-production/")).toBe(false);
    expect(isApprovedPaymentDatabase("/tmp/payments.sqlite")).toBe(false);
  });

  it("accepts only the two app-owned logo trees",()=>{
    expect(isApprovedLogoRoot("/home/bitcoinwalk/.local/share/bitcoinwalk/city-logos")).toBe(true);
    expect(isApprovedLogoRoot("/home/bitcoinwalk/.local/share/bitcoinwalk-production/city-logos/london")).toBe(true);
    expect(isApprovedLogoRoot("/home/bitcoinwalk/.local/share/bitcoinwalk-production-evil/city-logos")).toBe(false);
  });
});
