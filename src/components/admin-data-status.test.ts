import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import AdminDataStatus from "./admin-data-status";

describe("AdminDataStatus",()=>{
 it("keeps unknown and failed data distinct from an empty result",()=>{
  const empty=renderToStaticMarkup(createElement(AdminDataStatus,{health:{state:"empty",message:"No requests found."},scope:"Requests"}));
  const failed=renderToStaticMarkup(createElement(AdminDataStatus,{health:{state:"failed",message:"Relay unavailable."},scope:"Requests",onRetry:()=>{}}));
  expect(empty).toContain("Nothing here yet");expect(empty).not.toContain("Retry");
  expect(failed).toContain("Data unavailable");expect(failed).toContain("Retry");expect(failed).toContain('role="alert"');
 });
 it("labels retained data as stale and exposes a scoped retry",()=>{
  const html=renderToStaticMarkup(createElement(AdminDataStatus,{health:{state:"stale",message:"Last-known rows remain visible.",checkedAt:"2026-10-14T12:00:00.000Z"},scope:"Cities",onRetry:()=>{}}));
  expect(html).toContain("Showing last known data");expect(html).toContain("Last-known rows remain visible.");expect(html).toContain("Retry");expect(html).toContain('aria-label="Cities data status"');
 });
});
