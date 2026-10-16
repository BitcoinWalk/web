import {describe,expect,it} from "vitest";
import {sponsorHostPayoutScope} from "./sponsor-host-payout-scope";

const madeira="83f15504-9fca-4d59-a0f6-616a559510df",other="e62592ac-a5fc-42df-8f31-94416f6ee8d5";

describe("sponsor host payout city scope",()=>{
 it("stays disabled without the independent feature flag",()=>{const scope=sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:madeira});expect(scope.enabled).toBe(false);expect(scope.allows(madeira)).toBe(false);});
 it("accepts an exact canonical city allowlist",()=>{const scope=sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED:"1",BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:`${madeira}, ${other}`});expect(scope.enabled).toBe(true);expect(scope.allProCities).toBe(false);expect([...scope.cityIds]).toEqual([madeira,other]);expect(scope.allows(other)).toBe(true);});
 it("can follow verified Pro eligibility for every present and future city",()=>{const scope=sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED:"1",BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:"*"});expect(scope).toMatchObject({enabled:true,allProCities:true});expect(scope.allows(crypto.randomUUID())).toBe(true);});
 it.each(["",`${madeira},${madeira}`,"madeira"])("fails closed for an invalid allowlist: %s",value=>{const scope=sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED:"1",BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:value});expect(scope.enabled).toBe(false);expect(scope.allows(madeira)).toBe(false);});
});
