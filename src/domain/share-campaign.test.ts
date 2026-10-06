import {describe,expect,it} from "vitest";
import {isManchesterBitfestCampaign,manchesterBitfestCityPreview,manchesterBitfestWalkPreview,MANCHESTER_BITFEST_MEDIA_HASH} from "./share-campaign";

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
