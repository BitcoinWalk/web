import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import CityPayment,{paidPlanMessage,paymentReferenceLabel,planHeading} from "./city-payment";

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
});
