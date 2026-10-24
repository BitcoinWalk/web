import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import type {SponsorOrder} from "../../payments/sponsor-types";
vi.mock("../../nostr/organizer-identity",()=>({signForOrganizer:vi.fn()}));
import PaidSponsorArtwork from "./artwork";
const order={id:"order",cityId:"city",cityName:"Madeira",pubkey:"a".repeat(64),logoHash:null} as SponsorOrder;
it("shows only upload before a logo is saved",()=>{
 const html=renderToStaticMarkup(<PaidSponsorArtwork order={order} token="private" onUploaded={()=>{}} onSponsorMore={()=>{}}/>);
 expect(html).toContain("Add your sponsor logo");expect(html).toContain("Sign and upload logo");expect(html).not.toContain("Create share image");expect(html).not.toContain("You’re all set");
});
it("resumes at image creation without a competing upload button",()=>{
 const html=renderToStaticMarkup(<PaidSponsorArtwork order={{...order,logoHash:"b".repeat(64)}} token="private" onUploaded={()=>{}} onSponsorMore={()=>{}}/>);
 expect(html).toContain("You’re all set — thank you!");expect(html).toContain("There’s nothing else you need to do.");expect(html).toContain("Optional");expect(html).toContain("Sponsor more walks");expect(html).toContain("Create share image");expect(html).toContain("Change logo");expect(html).not.toContain("Sign and upload logo");expect(html).not.toContain('type="file"');
 expect(html.indexOf("Sponsor more walks")).toBeLessThan(html.indexOf("Create share image"));
});
it("does not claim completion when the booking requires date review",()=>{
 const html=renderToStaticMarkup(<PaidSponsorArtwork order={{...order,logoHash:"b".repeat(64),needsReview:true}} token="private" onUploaded={()=>{}} onSponsorMore={()=>{}}/>);
 expect(html).toContain("needs a date review");expect(html).not.toContain("You’re all set");expect(html).not.toContain("nothing else");
});
