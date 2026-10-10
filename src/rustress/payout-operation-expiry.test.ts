import {describe,expect,it} from "vitest";
import {MAXIMUM_NODE_TIMEOUT_MILLISECONDS,payoutOperationExpiryDelay} from "./payout-operation-expiry";

describe("payout operation expiry timer",()=>{
 it("caps a 30-day grant below Node's signed 32-bit timer limit",()=>{
  expect(payoutOperationExpiryDelay(2_592_000,0)).toBe(MAXIMUM_NODE_TIMEOUT_MILLISECONDS);
 });
 it("uses the exact remaining interval once it fits",()=>{
  expect(payoutOperationExpiryDelay(100,25_000)).toBe(75_000);
 });
 it("expires immediately without using a zero or negative timer",()=>{
  expect(payoutOperationExpiryDelay(100,100_000)).toBe(1);
  expect(payoutOperationExpiryDelay(100,101_000)).toBe(1);
 });
});
