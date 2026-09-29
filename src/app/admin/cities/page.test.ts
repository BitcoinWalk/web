import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitiesPage,{cityTabFromLocation,movedCityTabHref} from "./page";

describe("focused city administration",()=>{
  it("keeps only city-specific views in Cities",()=>{
    const html=renderToStaticMarkup(createElement(CitiesPage));
    for(const label of ["City list","Review requests","Edit city"])expect(html).toContain(label);
    for(const moved of ["Editors","Walk moderation"])expect(html).not.toContain(moved);
  });
  it("opens old approval anchors in Review requests",()=>{
    const hash=`#submission-${"a".repeat(64)}`;
    expect(cityTabFromLocation("?tab=manage",hash)).toBe("requests");
    expect(cityTabFromLocation("?tab=editors","")).toBe("manage");
    expect(cityTabFromLocation("?tab=moderation","")).toBe("manage");
    expect(cityTabFromLocation("?tab=unexpected","")).toBe("manage");
  });
  it("preserves old combined-Cities links by sending moved tools to their modules",()=>{
    expect(movedCityTabHref("?tab=editors&city=memphis")).toBe("/admin/organizers?tab=editors&city=memphis");
    expect(movedCityTabHref("?tab=moderation")).toBe("/admin/walks?tab=moderation");
    expect(movedCityTabHref("?tab=requests")).toBeNull();
  });
});
