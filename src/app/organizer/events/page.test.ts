import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OrganizerEventsPage from "./page";

describe("organizer events landing view",()=>{
  it("shows the scheduled-walk entry point without opening the creation form",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerEventsPage));
    expect(html).toContain("Scheduled walks");
    expect(html).toContain("Connect and load your walks");
    expect(html).not.toContain("Occurrence schedule");
    expect(html).not.toContain("Preview occurrences");
  });
});
