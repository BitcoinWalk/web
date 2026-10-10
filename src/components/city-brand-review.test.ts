import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityBrandReview from "./city-brand-review";

describe("CityBrandReview",()=>{
 it("embeds Pro activation requests in the main request workflow",()=>{const html=renderToStaticMarkup(createElement(CityBrandReview,{actor:"a".repeat(64)}));expect(html).toContain("Pro city account activations (0)");expect(html).toContain("generated automatically");expect(html).toContain("official identity");expect(html).toContain("separate, explicit action");expect(html).toContain("independent relay read-back");expect(html).toContain("Refresh activation requests");});
});
