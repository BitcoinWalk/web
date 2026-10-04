import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import SponsorModule from "./sponsor-module";
describe("SponsorModule",()=>{
 it("renders nothing while hidden",()=>expect(renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"hidden"}}))).toBe(""));
 it("invites a sponsor for enabled empty inventory",()=>expect(renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"empty"}}))).toContain("Would you like to sponsor this or a future walk?"));
 it("uses only the approved website snapshot",()=>{const html=renderToStaticMarkup(createElement(SponsorModule,{presentation:{state:"sponsor",pubkey:"a".repeat(64),website:"https://sponsor.example/"}}));expect(html).toContain("Sponsored by");expect(html).toContain('href="https://sponsor.example/"');});
});
