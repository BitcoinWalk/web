import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitySupportActions from "./city-support-actions";

describe("public Basic city upgrade",()=>{
 it("offers the gift upgrade without duplicating the host-card donation",()=>{const html=renderToStaticMarkup(createElement(CitySupportActions,{cityId:"city",revisionId:"b".repeat(64),cityName:"Memphis",upgradeAvailable:true}));expect(html).toContain("Upgrade this city — 21,000 sats");expect(html).toContain("future payments to the city then send 79% to the organizer");expect(html).not.toContain("Donate to BitcoinWalk HQ");});
 it("renders no empty support section when an upgrade is unavailable",()=>{const html=renderToStaticMarkup(createElement(CitySupportActions,{cityId:"city",revisionId:"b".repeat(64),cityName:"Memphis",upgradeAvailable:false}));expect(html).toBe("");});
});
