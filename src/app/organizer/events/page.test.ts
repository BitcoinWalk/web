import {createElement} from "react";
import {readFileSync} from "node:fs";
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
  it("offers the shared walk status views to every connected role",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    expect(source).toContain('aria-label="Filter walks"');
    expect(source).toContain('["all","next","upcoming","past"]');
    expect(source).toContain('value==="next"?"Next Walk"');
    expect(source).not.toContain('aria-label="Filter walks by status"');
  });
});
