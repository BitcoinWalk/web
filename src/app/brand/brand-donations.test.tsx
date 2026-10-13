import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import BrandDonations,{liquidDonationAddress} from "./brand-donations";

describe("brand value-for-value donations",()=>{
 it("keeps donations separate from access and exposes the exact Lightning, on-chain and Liquid destinations",()=>{const html=renderToStaticMarkup(createElement(BrandDonations));expect(html).toContain("Value for value");expect(html).toContain("lightning:donate@bitcoinwalk.org");expect(html).toContain("bitcoin:bc1qhx0dz0hnt2u4y72eatetu4jjrwy26v0p940yc3");expect(html).toContain(`liquidnetwork:${liquidDonationAddress}`);expect(html).toContain("Donations are optional");expect(html).not.toContain("disabled");expect(html).not.toContain("42 sats");});
});
