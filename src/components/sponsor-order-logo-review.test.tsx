import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import SponsorOrderLogoReview from "./sponsor-order-logo-review";
import type {SponsorOrder} from "../payments/sponsor-types";
const order:SponsorOrder={id:"order",cityId:"city",cityName:"Warszawa",status:"paid",pubkey:"a".repeat(64),logoHash:"b".repeat(64),count:1,walks:[],amountMsat:21000000,invoice:"",paymentHash:null,createdAt:1,expiresAt:2,settledAt:1,recoveryAcknowledgedAt:1,needsReview:false,payoutPolicy:{origin:"platform",hostBasisPoints:0,retainedBasisPoints:10000}};
describe("paid order logo review controls",()=>{
  it("offers logo review before approval",()=>{
    const html=renderToStaticMarkup(<SponsorOrderLogoReview order={order} onChanged={async()=>{}}/>);
    expect(html).toContain("Review logo");
    expect(html).not.toContain("Generate / preview OG image");
  });
  it("keeps OG generation accessible for an already approved order",()=>{
    const html=renderToStaticMarkup(<SponsorOrderLogoReview order={order} approved onChanged={async()=>{}}/>);
    expect(html).toContain("Generate / preview OG image");
    expect(html).not.toContain("Sign and approve logo");
    expect(html).not.toContain("generated successfully");
  });
});
