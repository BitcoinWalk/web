import {describe,expect,it} from "vitest";
import type {PaymentView} from "./service";
import {paidPaymentForCity} from "./dashboard";

function payment(cityId:string,status:PaymentView["status"],tier:PaymentView["tier"]):PaymentView{
 return {id:"invoice",cityId,owner:"a".repeat(64),cityName:"City",revisionId:"b".repeat(64),invoice:"lnbc",paymentHash:"c".repeat(64),amountMsat:21_000_000,createdAt:1,expiresAt:2,status,settledAt:status==="paid"?2:null,checkedAt:2,tier};
}

describe("paid city markers",()=>{
 it("requires both a settled payment and durable paid entitlement",()=>{
  expect(paidPaymentForCity([payment("paid","paid","paid")],"paid")).toBeDefined();
  expect(paidPaymentForCity([payment("pending","pending","free")],"pending")).toBeUndefined();
  expect(paidPaymentForCity([payment("selected","paid","free")],"selected")).toBeUndefined();
 });
});
