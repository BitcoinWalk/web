import sharp from "sharp";
import type {CityLogoVariant} from "./inkscape-source";

export const bitcoinwalkOnBlackArtifact = {left: 293, top: 0, width: 189, height: 1} as const;

export async function correctHistoricalLogoSource(variant: CityLogoVariant, png: Buffer): Promise<Buffer> {
  if (variant !== "bitcoinwalk-on-black") return png;
  const {data, info} = await sharp(png, {limitInputPixels: 40_000_000})
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});
  const artifact = bitcoinwalkOnBlackArtifact;
  if (artifact.left + artifact.width > info.width || artifact.top + artifact.height > info.height) {
    throw new Error("Historical city-logo artifact is outside the source image");
  }
  for (let y = artifact.top; y < artifact.top + artifact.height; y += 1) {
    for (let x = artifact.left; x < artifact.left + artifact.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      for (let channel = 0; channel < info.channels; channel += 1) data[offset + channel] = 0;
    }
  }
  return sharp(data, {raw: {width: info.width, height: info.height, channels: info.channels}})
    .png({compressionLevel: 9, adaptiveFiltering: false, palette: false})
    .toBuffer();
}
