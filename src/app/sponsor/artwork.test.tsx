import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import type {SponsorOrder} from "../../payments/sponsor-types";
vi.mock("../../nostr/organizer-identity",()=>({signForOrganizer:vi.fn()}));
import PaidSponsorArtwork from "./artwork";
const order={id:"order",cityId:"city",cityName:"Madeira",pubkey:"a".repeat(64),logoHash:null} as SponsorOrder;
it("shows only upload before a logo is saved",()=>{
 const html=renderToStaticMarkup(<PaidSponsorArtwork order={order} token="private" onUploaded={()=>{}}/>);
 expect(html).toContain("Step 1 of 3");expect(html).toContain("Sign and upload logo");expect(html).not.toContain("Create share image");expect(html).not.toContain("Download share image");
});
it("resumes at image creation without a competing upload button",()=>{
 const html=renderToStaticMarkup(<PaidSponsorArtwork order={{...order,logoHash:"b".repeat(64)}} token="private" onUploaded={()=>{}}/>);
 expect(html).toContain("Step 2 of 3");expect(html).toContain("Create share image");expect(html).toContain("Change logo");expect(html).not.toContain("Sign and upload logo");expect(html).not.toContain('type="file"');
});
