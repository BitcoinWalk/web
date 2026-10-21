import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {nip19} from "nostr-tools";
import SponsorModule from "./sponsor-module";
describe("SponsorModule",()=>{
 it("links the conference invitation to the dedicated event offer",()=>{const html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"empty"},cityName:"Lugano",luganoEvent:true}));expect(html).toContain('href="/sponsor/lugano-planb"');expect(html).toContain("210,000 sats");expect(html).toContain("everywhere this walk is advertised");});
 it("renders nothing while hidden",()=>expect(renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"hidden"},cityName:"Memphis"}))).toBe(""));
 it("uses the global horizontal brand fallback and moves prices to the sponsor page",()=>{const html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"empty"},cityName:"Barcelona"}));expect(html).toContain("Sponsor BitcoinWalk in Barcelona");expect(html).toContain("Help keep this and future local walks free, visible and welcoming.");expect(html).toContain('/brand/bitcoinwalk-horizontal.png');expect(html).toContain('href="/sponsor?city=Barcelona"');expect(html).not.toContain("21k sats");expect(html).not.toContain("69k sats");});
 it("uses the approved city lockup when one is available",()=>{const html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"empty"},cityName:"Barcelona",cityLogo:{src:"/api/city-logos/job/barcelona-bitcoinwalk-horizontal-on-white.png",width:1600,height:500}}));expect(html).toContain("barcelona-bitcoinwalk-horizontal-on-white.png");expect(html).toContain('alt="BitcoinWalk Barcelona"');});
 it("shows the sponsor npub and branded OG image",()=>{const pubkey="a".repeat(64),html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"sponsor",pubkey,website:"https://sponsor.example/"},cityName:"Barcelona",ogImageUrl:`/api/og/files/${"b".repeat(64)}.jpg`}));expect(html).toContain("Sponsored by");expect(html).toContain(nip19.npubEncode(pubkey));expect(html).toContain(`/api/og/files/${"b".repeat(64)}.jpg`);expect(html).toContain('href="https://sponsor.example/"');});
});
