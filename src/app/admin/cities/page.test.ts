import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitiesPage,{movedCityTabHref} from "./page";

describe("focused city administration",()=>{
  it("opens the city list directly without duplicate page tabs",()=>{
    const html=renderToStaticMarkup(createElement(CitiesPage));
    expect(html).toContain("City list");
    expect(html).toContain("Archived cities (0)");
    expect(html).toContain("<details>");
    expect(html).not.toContain("<h1>Cities</h1>");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Edit city");
    expect(html).not.toContain("Review requests");
    for(const moved of ["Editors","Walk moderation"])expect(html).not.toContain(moved);
  });
  it("preserves old combined-Cities links by sending moved tools to their modules",()=>{
    expect(movedCityTabHref("?tab=editors&city=memphis")).toBe("/admin/organizers?tab=editors&city=memphis");
    expect(movedCityTabHref("?tab=moderation")).toBe("/admin/walks?tab=moderation");
    expect(movedCityTabHref("?tab=requests")).toBe("/admin/requests");
    expect(movedCityTabHref("?tab=manage",`#submission-${"a".repeat(64)}`)).toBe("/admin/requests");
  });
});
