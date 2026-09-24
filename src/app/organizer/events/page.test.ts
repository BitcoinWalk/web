import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OrganizerEventsPage from "./_screen";

describe("organizer events landing view",()=>{
  it("shows the walks entry point without the removed copy or creation form",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerEventsPage));
    expect(html).toContain("Walks");
    expect(html).not.toContain("Scheduled walks");
    expect(html).not.toContain("City profile and permissions");
    expect(html).not.toContain("Occurrence schedule");
    expect(html).not.toContain("Preview occurrences");
  });
});
