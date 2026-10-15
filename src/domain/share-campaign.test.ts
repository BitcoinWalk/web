import {describe,expect,it} from "vitest";
import {isLuganoPlanBConference,isManchesterBitfestCampaign,luganoPlanBCityPreview,luganoPlanBWalkPreview,manchesterBitfestCityPreview,manchesterBitfestWalkPreview,LUGANO_PLANB_MEDIA_HASH,MANCHESTER_BITFEST_MEDIA_HASH} from "./share-campaign";

const hero=`https://app-staging.bitcoinwalk.org/api/media/files/${MANCHESTER_BITFEST_MEDIA_HASH}.webp`;
describe("Manchester Bitfest share campaign",()=>{
  it("is bound to Manchester and the exact managed conference hero",()=>{
    expect(isManchesterBitfestCampaign("manchester",[hero])).toBe(true);
    expect(isManchesterBitfestCampaign("manchester",[`https://app-staging.bitcoinwalk.org/api/media/files/${"a".repeat(64)}.webp`])).toBe(false);
    expect(isManchesterBitfestCampaign("another-city",[hero])).toBe(false);
  });
  it("uses concise conference-specific city and walk copy",()=>{
    const city=manchesterBitfestCityPreview(),walk=manchesterBitfestWalkPreview({start:Date.parse("2026-11-22T10:30:00Z")/1000,end:Date.parse("2026-11-22T11:30:00Z")/1000,timeZone:"Europe/London",meetingPoint:"Outside the Pendulum Hotel."},0);
    expect(city.title).toContain("Bitfest Manchester");
    expect(walk.title).toBe("BitcoinWalk at Bitfest | Sunday, 22 November 2026");
    expect(walk.description).toContain("Meet outside the Pendulum Hotel for a friendly walk");
    expect([...walk.title].length).toBeLessThanOrEqual(65);
    expect([...walk.description].length).toBeLessThanOrEqual(160);
  });
});

describe("Lugano Plan B Forum share campaign",()=>{
  const hero=`https://app-staging.bitcoinwalk.org/api/media/files/${LUGANO_PLANB_MEDIA_HASH}.webp`;
  it("is bound to Lugano and the exact approved conference hero",()=>{
    expect(isLuganoPlanBConference("lugano",[hero])).toBe(true);
    expect(isLuganoPlanBConference("lugano",[`https://app-staging.bitcoinwalk.org/api/media/files/${"a".repeat(64)}.webp`])).toBe(false);
    expect(isLuganoPlanBConference("another-city",[hero])).toBe(false);
  });
  it("uses conference-side-event copy for the Sunday walk",()=>{
    const city=luganoPlanBCityPreview(),walk=luganoPlanBWalkPreview({start:Date.parse("2026-10-25T09:00:00Z")/1000,end:Date.parse("2026-10-25T10:00:00Z")/1000,timeZone:"Europe/Zurich",meetingPoint:"Satoshi Nakamoto Statue, Parco Ciani"},0);
    expect(city.title).toContain("Plan ₿ Forum Lugano");
    expect(walk.title).toBe("BitcoinWalk at Plan ₿ Forum | Sunday, 25 October 2026");
    expect(walk.description).toContain("Plan ₿ Forum side event");
  });
});
