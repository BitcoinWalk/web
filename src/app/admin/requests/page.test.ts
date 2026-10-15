import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import RequestsPage from "./page";

describe("city request review interface",()=>{
 const source=readFileSync(new URL("../_approvals-screen.tsx",import.meta.url),"utf8"),styles=readFileSync(new URL("../../styles.css",import.meta.url),"utf8");
 it("renders the two actionable request queues without the redundant summary",()=>{const html=renderToStaticMarkup(createElement(RequestsPage));expect(html).toContain("<h1>Requests</h1>");expect(html).toContain("City request queue (0)");expect(html).toContain('role="combobox"');expect(html).toContain("Search waiting city requests…");expect(html).not.toContain("City request queues");});
 it("keeps the city register compact and opens a full-screen review workspace",()=>{expect(source).toContain('className="request-review-row"');expect(source).toContain('role="dialog"');expect(source).not.toContain("Review request and approval settings");expect(styles).toContain(".request-modal-backdrop{position:fixed");expect(styles).toContain("overscroll-behavior:contain");});
 it("offers the three explicit decisions in the intended hierarchy",()=>{expect(source).toContain('decide(selectedSubmission,"accept")');expect(source).toContain('decide(selectedSubmission,"changes")');expect(source).toContain('decide(selectedSubmission,"reject")');expect(source).toContain('request-action--accept');expect(source).toContain('request-action--changes');expect(source).toContain('request-action--reject');});
 it("filters only work owned by the super-admin or awaiting a third party",()=>{for(const label of ["All waiting","Action required","Awaits change"])expect(source).toContain(`label:"${label}"`);expect(source).toContain('submission.status==="pending"||submission.status==="needs-changes"');expect(source).not.toContain('className="request-review-archive"');});
});
