import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CitiesPage,{cityTabFromLocation} from "./page";

describe("consolidated city administration",()=>{
  it("provides one Cities page with four focused views",()=>{
    const html=renderToStaticMarkup(createElement(CitiesPage));
    for(const label of ["City list","Review requests","Profile","Editors"])expect(html).toContain(label);
  });
  it("opens old approval anchors in Review requests",()=>{
    const hash=`#submission-${"a".repeat(64)}`;
    expect(cityTabFromLocation("?tab=manage",hash)).toBe("requests");
    expect(cityTabFromLocation("?tab=editors","")).toBe("editors");
    expect(cityTabFromLocation("?tab=unexpected","")).toBe("manage");
  });
});
