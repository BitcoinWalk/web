import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitySupportActions from "./city-support-actions";

describe("public Basic city support choices",()=>{
 it("offers a gift upgrade and an explicit HQ-only donation",()=>{const html=renderToStaticMarkup(createElement(CitySupportActions,{cityId:"city",revisionId:"b".repeat(64),cityName:"Memphis",upgradeAvailable:true}));expect(html).toContain("Upgrade this city — 21,000 sats");expect(html).toContain("future payments to the city then send 79% to the organizer");expect(html).toContain('href="lightning:donate@bitcoinwalk.org"');expect(html).toContain("local organizer receives no share");});
 it("keeps the donation but hides upgrade checkout when the city is not eligible",()=>{const html=renderToStaticMarkup(createElement(CitySupportActions,{cityId:"city",revisionId:"b".repeat(64),cityName:"Memphis",upgradeAvailable:false}));expect(html).not.toContain("Upgrade this city — 21,000 sats");expect(html).toContain("Donate to BitcoinWalk HQ");});
});
