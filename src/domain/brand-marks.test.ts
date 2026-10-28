import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bitcoinWalkMark, bitcoinWalkMarks } from "./brand-marks";

describe("BitcoinWalk brand mark catalogue", () => {
  it("binds every selectable /brand variant to an existing approved asset", () => {
    expect(bitcoinWalkMarks).toHaveLength(15);
    expect(new Set(bitcoinWalkMarks.map((mark) => mark.id)).size).toBe(15);
    for (const mark of bitcoinWalkMarks) {
      expect(existsSync(join(process.cwd(), "public", mark.path))).toBe(true);
      expect(existsSync(join(process.cwd(), "public", mark.preview))).toBe(true);
    }
  });

  it("falls back to the traditional mark for older manifests", () => {
    expect(bitcoinWalkMark(undefined).id).toBe("traditional");
  });
});
