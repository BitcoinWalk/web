import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityBrandReview from "./city-brand-review";

describe("CityBrandReview",()=>{
 it("embeds a concise Pro activation queue in the main request workflow",()=>{const html=renderToStaticMarkup(createElement(CityBrandReview,{actor:"a".repeat(64)}));expect(html).toContain("Pro city account activations (0)");expect(html).toContain("Verify the city identity");expect(html).toContain(">Refresh<");expect(html).toContain("Activation requests not loaded");expect(html).not.toContain("Completed activations");});
});
