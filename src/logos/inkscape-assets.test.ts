import {readFile} from "node:fs/promises";
import {join} from "node:path";
import sharp from "sharp";
import {describe, expect, it} from "vitest";
import {cityLogoEditableLayouts, cityLogoVariants} from "./inkscape-source";

const pilots = [
  {slug: "warszawa", city: "WARSZAWA"},
  {slug: "radom", city: "RADOM"},
  {slug: "szydlowiec", city: "SZYDŁOWIEC"},
] as const;

describe("versioned Inkscape pilot masters", () => {
  it.each(pilots.flatMap(pilot => cityLogoVariants.map(variant => ({...pilot, variant}))))(
    "$slug/$variant preserves approved artwork and exposes one editable city label",
    async ({slug, city, variant}) => {
      const svgPath = join(process.cwd(), "design", "city-logo-templates", "v1", "editable-masters", slug, `${variant}.svg`);
      const pngPath = join(process.cwd(), "design", "city-logo-templates", "v1", "examples", "prototype-packs", slug, `${slug}-${variant}.png`);
      const svg = await readFile(svgPath, "utf8");
      expect(svg.match(/<text\b/g)).toHaveLength(1);
      expect(svg).toContain('data-bitcoinwalk-field="city-name"');
      expect(svg).toContain(`>${city}</text>`);
      expect(svg).not.toContain("<script");
      expect(svg).not.toMatch(/(?:href|src)="https?:/);

      const approved = await sharp(pngPath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
      const editable = await sharp(svgPath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
      expect(editable.info.width).toBe(approved.info.width);
      expect(editable.info.height).toBe(approved.info.height);

      const erase = cityLogoEditableLayouts[variant].erase;
      let totalDifference = 0;
      let outsideChanged = 0;
      let outsideChannels = 0;
      let outsideLargestDifference = 0;
      for (let y = 0; y < approved.info.height; y += 1) {
        for (let x = 0; x < approved.info.width; x += 1) {
          const insideEditableLabel = x >= erase.x && x < erase.x + erase.width && y >= erase.y;
          const correctedSourceArtifact = variant === "bitcoinwalk-on-black" && y === 0 && x >= 293 && x <= 481;
          for (let channel = 0; channel < 4; channel += 1) {
            const offset = (y * approved.info.width + x) * 4 + channel;
            const difference = Math.abs(approved.data[offset] - editable.data[offset]);
            totalDifference += difference;
            if (!insideEditableLabel&&!correctedSourceArtifact) {
              outsideChannels += 1;
              if (difference) outsideChanged += 1;
              outsideLargestDifference = Math.max(outsideLargestDifference, difference);
            }
          }
        }
      }

      // librsvg can round a premultiplied-alpha channel by one unit. Outside
      // the deliberately replaced label, the approved pixels are otherwise
      // unchanged. The total mean also bounds the live-text reconstruction;
      // Ubuntu and GitHub's sharp/librsvg builds rasterize the bundled font
      // slightly differently, so this cross-platform bound covers both while
      // the strict outside-label assertions continue protecting brand pixels.
      expect(outsideLargestDifference).toBeLessThanOrEqual(1);
      expect(outsideChanged / outsideChannels).toBeLessThan(0.01);
      expect(totalDifference / approved.data.length).toBeLessThan(16);
      if(variant==="bitcoinwalk-on-black"){
        const {data,info}=await sharp(svgPath).ensureAlpha().extract({left:293,top:0,width:189,height:1}).raw().toBuffer({resolveWithObject:true});
        for(let offset=3;offset<data.length;offset+=info.channels) expect(data[offset]).toBe(0);
      }
    },
    15_000,
  );
});
