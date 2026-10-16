import {describe,expect,it} from "vitest";
import {sponsorHostPayoutScope} from "./sponsor-host-payout-scope";

const madeira="83f15504-9fca-4d59-a0f6-616a559510df",other="e62592ac-a5fc-42df-8f31-94416f6ee8d5";

describe("sponsor host payout city scope",()=>{
 it("stays disabled without the independent feature flag",()=>{expect(sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:madeira})).toEqual({enabled:false,cityIds:new Set()});});
 it("accepts an exact canonical city allowlist",()=>{const scope=sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED:"1",BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:`${madeira}, ${other}`});expect(scope.enabled).toBe(true);expect([...scope.cityIds]).toEqual([madeira,other]);});
 it.each(["",`${madeira},${madeira}`,"madeira"])("fails closed for an invalid allowlist: %s",value=>{expect(sponsorHostPayoutScope({BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED:"1",BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS:value})).toEqual({enabled:false,cityIds:new Set()});});
});
