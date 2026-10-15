import {createElement} from "react";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitiesPage,{movedCityTabHref} from "./page";

describe("focused city administration",()=>{
  it("opens the city list directly without duplicate page tabs",()=>{
    const html=renderToStaticMarkup(createElement(CitiesPage)),source=readFileSync(new URL("../../../components/city-moderation.tsx",import.meta.url),"utf8");
    expect(html).toContain("City operational backlog");
    expect(html).toContain('aria-label="Cities data status"');
    expect(html).toContain("Loading the city directory and operational checks");
    expect(html).toContain("Action required 0");
    expect(html).toContain("Awaits change 0");
    expect(html).toContain("Online 0");
    expect(html).toContain("Offline 0");
    expect(html).not.toContain("<h1>Cities</h1>");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Edit city");
    expect(html).not.toContain("Review requests");
    expect(source).not.toContain("setRows([])");
    expect(source).toContain("setDashboardAuthorizationScope(authorizationScope,false)");
    for(const moved of ["Editors","Walk moderation"])expect(html).not.toContain(moved);
  });
  it("preserves old combined-Cities links by sending moved tools to their modules",()=>{
    expect(movedCityTabHref("?tab=editors&city=memphis")).toBe("/admin/organizers?tab=editors&city=memphis");
    expect(movedCityTabHref("?tab=moderation")).toBe("/admin/cities");
    expect(movedCityTabHref("?tab=requests")).toBe("/admin/requests");
    expect(movedCityTabHref("?tab=manage",`#submission-${"a".repeat(64)}`)).toBe("/admin/requests");
  });
});
