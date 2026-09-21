import { describe, expect, it } from "vitest";
import { cityHostname, citySlugSchema } from "./city";

describe("city routes", () => {
  it("uses a dedicated hostname for a paid city relay", () => {
    expect(cityHostname({ slug: "austin" }, true)).toBe("austin.bitcoinwalk.org");
  });

  it("keeps free cities on the shared hostname", () => {
    expect(cityHostname({ slug: "austin" }, false)).toBe("bitcoinwalk.org");
  });

  it("rejects unsafe city slugs", () => {
    expect(citySlugSchema.safeParse("Austin Texas").success).toBe(false);
  });
});
