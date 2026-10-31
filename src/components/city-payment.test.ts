import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityPayment,{paidPlanMessage,paymentErrorMessage,paymentReferenceLabel,planHeading} from "./city-payment";

describe("CityPayment",()=>{
  it("renders the automatic Pro payment screen without action buttons",()=>{
    const html=renderToStaticMarkup(createElement(CityPayment,{cityId:"city",revisionId:"a".repeat(64),owner:"b".repeat(64),payoutDestination:"alice@wallet.example",autoCreate:true,passive:true}));
    expect(html).toContain("Pro plan — 21,000 sats");
    expect(html).not.toContain("<button");
  });
  it("distinguishes an administrative Pro grant from a Lightning settlement",()=>{
    expect(paidPlanMessage("admin-pro-promotion-v1")).toContain("Pro access granted");
    expect(paidPlanMessage("admin-pro-promotion-v1")).not.toContain("Payment verified");
    expect(paymentReferenceLabel("admin-pro-promotion-v1")).toBe("Administrative grant event");
    expect(planHeading("admin-pro-promotion-v1")).toBe("Pro plan — lifetime access");
    expect(paidPlanMessage("checkout-v1")).toContain("Payment verified");
  });
  it("turns a browser network failure into a safe resumable message",()=>{
    expect(paymentErrorMessage(new TypeError("NetworkError when attempting to fetch resource."))).toContain("try again");
    expect(paymentErrorMessage(new TypeError("NetworkError when attempting to fetch resource."))).toContain("city submission is saved");
    expect(paymentErrorMessage(new Error("Payment access denied."))).toBe("Payment access denied.");
  });
  it("shows an existing invoice for payment from another wallet",()=>{
    const payment={id:"invoice",cityId:"city",owner:"b".repeat(64),cityName:"Dresden",revisionId:"a".repeat(64),invoice:"lnbc1invoice",paymentHash:"c".repeat(64),amountMsat:21_000_000,createdAt:1,expiresAt:2_000_000_000,status:"pending" as const,settledAt:null,checkedAt:null,tier:"free" as const};
    const html=renderToStaticMarkup(createElement(CityPayment,{cityId:"city",revisionId:"a".repeat(64),owner:"b".repeat(64),payoutDestination:"",passive:true,initialPayment:payment}));
    expect(html).toContain("lightning:lnbc1invoice");
    expect(html).toContain("Copy invoice");
    expect(html).toContain("signer and payment wallet can be different");
  });
});
