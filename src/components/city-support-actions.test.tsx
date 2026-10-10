import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitySupportActions from "./city-support-actions";

describe("public Basic city upgrade",()=>{
 it("offers a warm host gift without duplicating the host-card donation",()=>{const html=renderToStaticMarkup(createElement(CitySupportActions,{cityId:"city",revisionId:"b".repeat(64),cityName:"Memphis",upgradeAvailable:true}));expect(html).toContain("Had a great BitcoinWalk?");expect(html).toContain("Gift Pro to the host — 21,000 sats");expect(html).toContain("enjoyed the company");expect(html).toContain("private community relay for Memphis");expect(html).toContain("rewarded for what they post");expect(html).not.toContain("Upgrade this city to Pro");expect(html).not.toContain("Donate to BitcoinWalk HQ");});
 it("renders no empty support section when an upgrade is unavailable",()=>{const html=renderToStaticMarkup(createElement(CitySupportActions,{cityId:"city",revisionId:"b".repeat(64),cityName:"Memphis",upgradeAvailable:false}));expect(html).toBe("");});
});
