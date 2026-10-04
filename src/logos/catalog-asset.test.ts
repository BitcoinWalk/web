import {describe, expect, it} from "vitest";
import {logoVariantAsset, type LogoPack} from "./catalog";

const pack = {
  jobKey: "a".repeat(64), slug: "barcelona",
  manifest: {files: [{name: "barcelona-bitcoinwalk-vertical-on-white.png", width: 751, height: 631}]},
} as LogoPack;

describe("city logo asset selection", () => {
  it("selects only the exact manifest-backed vertical-on-white city asset", () => {
    expect(logoVariantAsset(pack, "bitcoinwalk-vertical-on-white")).toEqual({
      src: `/api/city-logos/${"a".repeat(64)}/barcelona-bitcoinwalk-vertical-on-white.png`,
      width: 751,
      height: 631,
    });
    expect(logoVariantAsset(pack, "missing" as never)).toBeNull();
  });
});
