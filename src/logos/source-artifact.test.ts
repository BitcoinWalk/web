import {readFile} from "node:fs/promises";
import {join} from "node:path";
import sharp from "sharp";
import {describe, expect, it} from "vitest";
import {bitcoinwalkOnBlackArtifact, correctHistoricalLogoSource} from "./source-artifact";

describe("historical city-logo artifact correction", () => {
  it("clears only the known white stripe and preserves the full brand symbol", async () => {
    const source = await readFile(join(
      process.cwd(),
      "design/city-logo-templates/v1/examples/prototype-packs/warszawa/warszawa-bitcoinwalk-on-black.png",
    ));
    const original = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const correctedPng = await correctHistoricalLogoSource("bitcoinwalk-on-black", source);
    const corrected = await sharp(correctedPng).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    expect(corrected.info).toMatchObject({width: original.info.width, height: original.info.height, channels: 4});

    let changedPixels = 0;
    let visibleBrandPixels = 0;
    let artifactIsTransparent = true;
    let untouchedPixelsMatch = true;
    for (let y = 0; y < original.info.height; y += 1) {
      for (let x = 0; x < original.info.width; x += 1) {
        const offset = (y * original.info.width + x) * 4;
        const artifact = y === bitcoinwalkOnBlackArtifact.top
          && x >= bitcoinwalkOnBlackArtifact.left
          && x < bitcoinwalkOnBlackArtifact.left + bitcoinwalkOnBlackArtifact.width;
        if (artifact) {
          if (!corrected.data.subarray(offset, offset + 4).equals(Buffer.from([0, 0, 0, 0]))) artifactIsTransparent = false;
        } else {
          if (!corrected.data.subarray(offset, offset + 4).equals(original.data.subarray(offset, offset + 4))) untouchedPixelsMatch = false;
        }
        if (!corrected.data.subarray(offset, offset + 4).equals(original.data.subarray(offset, offset + 4))) changedPixels += 1;
        if (x >= 180 && x < 600 && y >= 100 && y < 420 && corrected.data[offset + 3] > 0) visibleBrandPixels += 1;
      }
    }
    expect(artifactIsTransparent).toBe(true);
    expect(untouchedPixelsMatch).toBe(true);
    expect(changedPixels).toBe(bitcoinwalkOnBlackArtifact.width);
    expect(visibleBrandPixels).toBeGreaterThan(20_000);
  });

  it("leaves every other variant byte-identical", async () => {
    const source = Buffer.from("not decoded for unaffected variants");
    await expect(correctHistoricalLogoSource("bitcoinwalk-on-white", source)).resolves.toBe(source);
  });
});
