#!/usr/bin/env node
// Local visual acceptance fixture, not a public generation endpoint.
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
import {renderCityLogoPack} from "../src/logos/city-logo-renderer.ts";
import {renderProfileArtwork} from "../src/logos/profile-artwork.ts";

const output = await mkdtemp(join(tmpdir(), "bitcoinwalk-profile-preview-"));
const panels = [];
for (const [index, cityName] of ["Warszawa", "Szydłowiec", "Frankfurt am Main"].entries()) {
  const slug = `preview-${index}`;
  await renderCityLogoPack({cityId: "c0db0e98-1011-4e1c-baaa-abe943e02381", cityName, slug, locale: "en"}, output);
  const cityLogo = await readFile(join(output, slug, `${slug}-bitcoinwalk-on-black.png`));
  // Local fixtures only: use the Warsaw hero for Warsaw and neutral fallbacks elsewhere.
  const hero = index === 0 ? await readFile("public/images/weather-heroes/warszawa/clear.webp") : null;
  const {avatar, banner} = await renderProfileArtwork(hero, cityLogo);
  await writeFile(join(output, `${slug}-avatar.webp`), avatar);
  await writeFile(join(output, `${slug}-banner.webp`), banner);
  const circle = async size => sharp(await sharp(avatar).resize(size, size).png().toBuffer()).composite([
    {input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`), blend: "dest-in"}
  ]).png().toBuffer();
  panels.push({input: await circle(240), left: 24, top: index * 290 + 24},
    {input: await circle(96), left: 285, top: index * 290 + 24},
    {input: await circle(48), left: 400, top: index * 290 + 24},
    {input: await sharp(banner).resize(600, 200).png().toBuffer(), left: 480, top: index * 290 + 24});
}
await sharp({create: {width: 1104, height: 870, channels: 3, background: "#f3f4f6"}})
  .composite(panels).png().toFile(join(output, "review.png"));
console.log(output);
