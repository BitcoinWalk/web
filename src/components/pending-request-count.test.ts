import {describe,expect,it} from "vitest";
import {pendingRequestCountFromEvent} from "./pending-request-count";

describe("pending request count events",()=>{
 it("accepts only safe sourced non-negative counts",()=>{
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:{source:"cities",count:3}}))).toEqual({source:"cities",count:3});
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:{source:"pro-activations",count:1}}))).toEqual({source:"pro-activations",count:1});
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:{source:"cities",count:-1}}))).toBeNull();
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:{source:"other",count:3}}))).toBeNull();
  expect(pendingRequestCountFromEvent(new CustomEvent("test",{detail:3}))).toBeNull();
 });
});
