import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("hosting invitation handoff",()=>{
 const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
 it("loads from the established dashboard identity without a second connect action",()=>{
  expect(source).toContain("useDashboardAutoLoad(load)");
  expect(source).toContain("The invitation is checked automatically for your connected account.");
  expect(source).not.toContain("Connect and view invitation");
 });
 it("shows the invited account, expiry and an explicit wrong-account recovery",()=>{
  expect(source).toContain("The invitation was sent to:");
  expect(source).toContain("Accept before:");
  expect(source).toContain("choose <strong>Disconnect</strong>");
 });
});
