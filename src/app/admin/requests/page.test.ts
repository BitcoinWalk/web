import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import RequestsPage from "./page";

describe("city request review interface",()=>{
 const source=readFileSync(new URL("../_approvals-screen.tsx",import.meta.url),"utf8"),styles=readFileSync(new URL("../../styles.css",import.meta.url),"utf8");
 it("renders the dedicated request module and all-city finder",()=>{const html=renderToStaticMarkup(createElement(RequestsPage));expect(html).toContain("<h1>Requests</h1>");expect(html).toContain("<h2>City applications</h2>");expect(html).toContain('role="combobox"');expect(html).toContain("Search all city applications…");});
 it("keeps the city register compact and opens a full-screen review workspace",()=>{expect(source).toContain('className="request-review-row"');expect(source).toContain('role="dialog"');expect(source).not.toContain("Review request and approval settings");expect(styles).toContain(".request-modal-backdrop{position:fixed");expect(styles).toContain("overscroll-behavior:contain");});
 it("offers the three explicit decisions in the intended hierarchy",()=>{expect(source).toContain('decide(selectedSubmission,"accept")');expect(source).toContain('decide(selectedSubmission,"changes")');expect(source).toContain('decide(selectedSubmission,"reject")');expect(source).toContain('request-action--accept');expect(source).toContain('request-action--changes');expect(source).toContain('request-action--reject');});
 it("filters all statuses and keeps archived cities in a separate bottom section",()=>{for(const label of ["All","Pending","Accepted","Needs changes","Rejected","Archived"])expect(source).toContain(`label:"${label}"`);expect(source.indexOf('className="request-review-archive"')).toBeGreaterThan(source.indexOf('className="request-review-list"'));});
});
