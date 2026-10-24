import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import ArtworkLifecycle,{artworkStageIndex} from "./artwork-lifecycle";

describe("artwork lifecycle",()=>{
 it("uses the truthful publication order",()=>{expect(["uploaded","approved","generated","applied"].map(value=>artworkStageIndex(value as never))).toEqual([0,1,2,3]);});
 it("explains that application is the public signed step",()=>{const html=renderToStaticMarkup(<ArtworkLifecycle stage="generated"/>);expect(html.indexOf("Uploaded")).toBeLessThan(html.indexOf("Approved"));expect(html.indexOf("Approved")).toBeLessThan(html.indexOf("Generated"));expect(html.indexOf("Generated")).toBeLessThan(html.indexOf("Applied"));expect(html).toContain("signed walk assignment");});
});
