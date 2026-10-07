import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityBrandReview from "./city-brand-review";

describe("CityBrandReview",()=>{
 it("explains the automatic profile and explicit publication boundary",()=>{const html=renderToStaticMarkup(createElement(CityBrandReview,{actor:"a".repeat(64)}));expect(html).toContain("City account review");expect(html).toContain("generated automatically");expect(html).toContain("official identity");expect(html).toContain("separate, explicit action");expect(html).toContain("independent relay read-back");expect(html).toContain("Load activation requests");});
});
