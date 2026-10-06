import {describe,expect,it} from "vitest";
import {heroObjectPosition,shareBackgroundPosition} from "./hero-presentation";

const bitfest="https://app-staging.bitcoinwalk.org/api/media/files/d64d013aee80e3382f0ef7576df259535c57b7d4d4ce5a07fa1a65bab16e21df.webp";

describe("hero presentation",()=>{
  it("keeps the full Bitfest logo visible from the top edge",()=>{
    expect(heroObjectPosition(bitfest)).toBe("center top");
    expect(shareBackgroundPosition([null,bitfest])).toBe("north");
  });

  it("retains attention crops for other managed media",()=>{
    const other="https://app-staging.bitcoinwalk.org/api/media/files/"+"a".repeat(64)+".webp";
    expect(heroObjectPosition(other)).toBe("center center");
    expect(shareBackgroundPosition([other])).toBe("attention");
  });
});
