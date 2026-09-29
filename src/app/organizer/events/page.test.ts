import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OrganizerEventsPage from "./_screen";

describe("organizer events landing view",()=>{
  it("leaves the single Walks page title to the containing module",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerEventsPage));
    expect(html).not.toContain("<h1>Walks</h1>");
    expect(html).not.toContain("Scheduled walks");
    expect(html).not.toContain("City profile and permissions");
    expect(html).not.toContain("Occurrence schedule");
    expect(html).not.toContain("Preview occurrences");
  });
});
