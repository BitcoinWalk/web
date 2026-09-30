import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitiesPage,{cityTabFromLocation,movedCityTabHref} from "./page";

describe("focused city administration",()=>{
  it("keeps only city-specific views in Cities",()=>{
    const html=renderToStaticMarkup(createElement(CitiesPage));
    for(const label of ["City list","Edit city"])expect(html).toContain(label);
    expect(html).not.toContain("Review requests");
    for(const moved of ["Editors","Walk moderation"])expect(html).not.toContain(moved);
  });
  it("keeps old approval anchors out of the city tabs",()=>{
    const hash=`#submission-${"a".repeat(64)}`;
    expect(cityTabFromLocation("?tab=manage",hash)).toBe("manage");
    expect(cityTabFromLocation("?tab=editors","")).toBe("manage");
    expect(cityTabFromLocation("?tab=moderation","")).toBe("manage");
    expect(cityTabFromLocation("?tab=unexpected","")).toBe("manage");
  });
  it("preserves old combined-Cities links by sending moved tools to their modules",()=>{
    expect(movedCityTabHref("?tab=editors&city=memphis")).toBe("/admin/organizers?tab=editors&city=memphis");
    expect(movedCityTabHref("?tab=moderation")).toBe("/admin/walks?tab=moderation");
    expect(movedCityTabHref("?tab=requests")).toBe("/admin/requests");
    expect(movedCityTabHref("?tab=manage",`#submission-${"a".repeat(64)}`)).toBe("/admin/requests");
  });
});
