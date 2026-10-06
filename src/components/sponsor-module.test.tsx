import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {nip19} from "nostr-tools";
import SponsorModule from "./sponsor-module";
describe("SponsorModule",()=>{
 it("renders nothing while hidden",()=>expect(renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"hidden"},cityName:"Memphis"}))).toBe(""));
 it("keeps the walk invitation compact and moves prices to the sponsor page",()=>{const html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"empty"},cityName:"Barcelona"}));expect(html).toContain("Sponsor BitcoinWalk in Barcelona");expect(html).toContain("Support this or an upcoming local walk.");expect(html).toContain('href="/sponsor?city=Barcelona"');expect(html).not.toContain("21k sats");expect(html).not.toContain("69k sats");});
 it("shows the sponsor npub and branded OG image",()=>{const pubkey="a".repeat(64),html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"sponsor",pubkey,website:"https://sponsor.example/"},cityName:"Barcelona",ogImageUrl:`/api/og/files/${"b".repeat(64)}.jpg`}));expect(html).toContain("Sponsored by");expect(html).toContain(nip19.npubEncode(pubkey));expect(html).toContain(`/api/og/files/${"b".repeat(64)}.jpg`);expect(html).toContain('href="https://sponsor.example/"');});
});
