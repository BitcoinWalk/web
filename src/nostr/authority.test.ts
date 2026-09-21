import { describe, expect, it } from "vitest";
import { SUPER_ADMIN_PUBKEY, isSuperAdmin } from "./authority";

describe("BitcoinWalk authority", () => {
  it("decodes the configured super-admin npub", () => {
    expect(SUPER_ADMIN_PUBKEY).toMatch(/^[0-9a-f]{64}$/);
    expect(isSuperAdmin(SUPER_ADMIN_PUBKEY)).toBe(true);
    expect(isSuperAdmin("0".repeat(64))).toBe(false);
  });
});
