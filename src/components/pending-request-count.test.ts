import {describe,expect,it} from "vitest";
import {pendingRequestCountFromEvent} from "./pending-request-count";

describe("pending request count events",()=>{
 it("accepts only safe non-negative counts",()=>{
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:3}))).toBe(3);
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:-1}))).toBeNull();
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:"3"}))).toBeNull();
 });
});
