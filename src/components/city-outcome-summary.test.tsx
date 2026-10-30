import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import CityOutcomeSummary from "./city-outcome-summary";
describe("city outcome reporting copy",()=>{
 it("distinguishes saved progress from live health and unmeasured app handoff",()=>{const html=renderToStaticMarkup(createElement(CityOutcomeSummary,{days:90,report:{status:"available",started:3,preparationReady:2,identityPublished:1,servicesActive:1,needsAttention:0}}));expect(html).toContain("last 90 days");expect(html).toContain("not a live health check");expect(html).toContain("App installation and community handoff are not measured");});
 it("shows unavailable data instead of invented zero counts",()=>{const html=renderToStaticMarkup(createElement(CityOutcomeSummary,{days:90,report:{status:"unavailable"}}));expect(html).toContain("City setup reporting is unavailable");expect(html).not.toContain("<strong>0</strong>");});
});
