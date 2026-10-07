import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityBrandReview from "./city-brand-review";

describe("CityBrandReview",()=>{
 it("states the private non-publishing boundary before loading requests",()=>{const html=renderToStaticMarkup(createElement(CityBrandReview,{actor:"a".repeat(64)}));expect(html).toContain("City account review");expect(html).toContain("Nothing is published");expect(html).toContain("Load activation requests");});
});
