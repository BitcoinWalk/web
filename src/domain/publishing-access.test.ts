import {describe,expect,it} from "vitest";
import {publishingAccessNotice} from "./publishing-access";

describe("organizer publishing access",()=>{
 it("explains suspended and fail-closed states",()=>{
  expect(publishingAccessNotice("suspended")).toContain("account’s publishing access is suspended");
  expect(publishingAccessNotice("unverified")).toContain("could not be verified");
  expect(publishingAccessNotice("active")).toBe("");
 });
});
