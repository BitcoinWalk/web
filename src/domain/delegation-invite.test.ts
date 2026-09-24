import {describe,expect,it} from "vitest";
import {walkHostInvitationText} from "./delegation-invite";

describe("walk hosting invitation copy",()=>{
 it("uses the event's city time and the requested invitation wording",()=>{
  const text=walkHostInvitationText({cityName:"Memphis",start:Date.UTC(2026,9,17,15)/1000,timeZone:"America/Chicago",acceptUrl:"https://app-staging.bitcoinwalk.org/admin/accept-invitation?invite=abc"});
  expect(text).toBe("Please accept this invite to host the BitcoinWalk in **Memphis on Saturday, 17 October 2026 at 10:00am local time** — we chose you because you'd make an amazing host:\n\nhttps://app-staging.bitcoinwalk.org/admin/accept-invitation?invite=abc\n\nA few things to make it great:\n\n- **Make everyone feel welcome** — greet each walker as they arrive, introduce newbies, and keep the vibe friendly and unhurried.\n- **Spark good conversations** — great openers for newcomers: *why self-custody is a silent revolution*, or *how a fixed supply of 21M is a first in human history*.\n- **Privacy first** — we take privacy seriously. No photos revealing who other participants are, so everyone can walk and talk freely.\n- Have fun, connect with local community and post the #ProofOfWalk\n\nHonoured to have you lead the way! 🟠");
 });
 it("uses UTC explicitly when a signed event has no time zone",()=>{
  const text=walkHostInvitationText({cityName:"Radom",start:Date.UTC(2026,9,3,10)/1000,timeZone:null,acceptUrl:"https://example.com/invite"});
  expect(text).toContain("10:00am UTC");
  expect(text).toContain("https://example.com/invite");
 });
});
