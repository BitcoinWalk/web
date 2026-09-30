import {describe,expect,it} from "vitest";
import {compactHomepageBrand} from "./city-directory";

describe("homepage brand",()=>{
 it("keeps the wordmark initially and compacts after the header scroll threshold",()=>{
  expect(compactHomepageBrand(0)).toBe(false);
  expect(compactHomepageBrand(72)).toBe(false);
  expect(compactHomepageBrand(73)).toBe(true);
 });
});
