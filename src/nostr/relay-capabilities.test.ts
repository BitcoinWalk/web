import { describe, expect, it } from "vitest";
import { supportsOccurrenceCancellationRelayVersion } from "./relay-capabilities";

describe("organizer relay capabilities", () => {
  it("accepts occurrence-cancellation releases monotonically", () => {
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-organizers-0.6.1")).toBe(true);
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-organizers-0.8.17")).toBe(true);
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-organizers-0.9.0")).toBe(true);
  });

  it("rejects older, unrelated, malformed and unsupported-major releases", () => {
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-organizers-0.6.0")).toBe(false);
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-foundation-0.8.17")).toBe(false);
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-organizers-0.8")).toBe(false);
    expect(supportsOccurrenceCancellationRelayVersion("bitcoinwalk-organizers-1.0.0")).toBe(false);
    expect(supportsOccurrenceCancellationRelayVersion(undefined)).toBe(false);
  });
});
