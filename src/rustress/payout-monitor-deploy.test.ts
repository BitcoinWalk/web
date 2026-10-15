import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("production payout operation monitor",()=>{
 const monitor=readFileSync("deploy/monitor-payout-operation-0.2.14.2.sh","utf8");
 it("keeps transient readiness fail-closed without discarding signed operation authority",()=>{
  expect(monitor).toContain('typeof body.ready!=="boolean"');
  expect(monitor).not.toContain('body.ready!==true');
  expect(monitor).toContain('body.mode!=="operation"');
  expect(monitor).toContain('body.enabled!==true');
 });
 it("still rolls back on unknown payment outcomes or invalid operation scope",()=>{
  expect(monitor).toContain('body.unknown!==0||body.invoiceOutcomesUnknown!==0');
  expect(monitor).toContain('body.authorizedCities!==2');
  expect(monitor).toContain('body.operationExpiresAt<=Math.floor(Date.now()/1000)');
 });
});
