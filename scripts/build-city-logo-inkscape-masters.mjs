#!/usr/bin/env node
import {createHash} from "node:crypto";
import {mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import process from "node:process";
import sharp from "sharp";
import {buildInkscapeEditableSvg, cityLogoEditableLayouts, cityLogoVariants} from "../src/logos/inkscape-source.ts";
import {correctHistoricalLogoSource} from "../src/logos/source-artifact.ts";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [slug, replaceFlag] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail("Usage: node scripts/build-city-logo-inkscape-masters.mjs <slug>");
}

const project = process.cwd();
const evidencePack = resolve(project, "design", "city-logo-templates", "v1", "examples", "prototype-packs", slug);
const sourceManifest = JSON.parse(await readFile(join(evidencePack, "manifest.json"), "utf8"));
const target = resolve(project, "design", "city-logo-templates", "v1", "editable-masters", slug);
const staging = `${target}.building-${process.pid}`;

const targetExists = (await stat(target).catch(error => error?.code === "ENOENT" ? null : Promise.reject(error)))?.isDirectory() ?? false;
if (targetExists && replaceFlag !== "--replace") fail(`Refusing to overwrite existing editable masters: ${target}`);

await mkdir(staging, {recursive: true, mode: 0o755});
try {
  const files = [];
  for (const variant of cityLogoVariants) {
    const sourcePng = `${slug}-${variant}.png`;
    const source = sourceManifest.files.find(file => file.name === sourcePng);
    if (!source) throw new Error(`Missing approved reference: ${sourcePng}`);
    const png = await readFile(join(evidencePack, sourcePng));
    const sourceSha256 = createHash("sha256").update(png).digest("hex");
    if (sourceSha256 !== source.sha256) throw new Error(`Approved PNG checksum mismatch: ${sourcePng}`);
    const {data, info} = await sharp(png, {limitInputPixels: 40_000_000}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const erase = cityLogoEditableLayouts[variant].erase;
    const background = [...data.subarray(0, 4)];
    const eraseFill = background[3] > 250
      ? `#${background.slice(0, 3).map(channel => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`
      : null;
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = erase.y; y < Math.min(info.height, erase.y + erase.height); y += 1) {
      for (let x = erase.x; x < Math.min(info.width, erase.x + erase.width); x += 1) {
        const offset = (y * info.width + x) * 4;
        const difference = Math.max(...background.map((channel, index) => Math.abs(data[offset + index] - channel)));
        if (difference > 5) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < minX || maxY < 0) throw new Error(`Could not measure approved city label: ${sourcePng}`);
    const measuredHeight = maxY - minY + 1;
    const reference = cityLogoEditableLayouts[variant].cityText;
    const cityText = {
      x: (minX + maxX) / 2,
      width: maxX - minX + 1,
      baseline: maxY,
      fontSize: Number((reference.fontSize * measuredHeight / reference.height).toFixed(3)),
    };

    const correctedPng = await correctHistoricalLogoSource(variant, png);
    const svg = buildInkscapeEditableSvg({
      cityId: sourceManifest.cityId,
      cityName: sourceManifest.cityName,
      slug,
      variant,
      width: source.width,
      height: source.height,
      sourcePng,
      sourceSha256,
      pngBase64: correctedPng.toString("base64"),
      cityText,
      eraseFill,
    });
    const svgName = `${variant}.svg`;
    await writeFile(join(staging, svgName), svg, {encoding: "utf8", mode: 0o644});
    files.push({
      variant,
      svg: svgName,
      sourcePng,
      sourceSha256,
      width: source.width,
      height: source.height,
      cityText: {...cityLogoEditableLayouts[variant].cityText, ...cityText},
    });
  }

  const manifest = {
    schemaVersion: 1,
    status: "editable-master",
    cityId: sourceManifest.cityId,
    cityName: sourceManifest.cityName,
    slug,
    font: {family: "Ubuntu", style: "Bold Italic", file: "../../fonts/Ubuntu-BoldItalic.ttf"},
    source: sourceManifest.source,
    files,
  };
  await writeFile(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o644});
  await mkdir(resolve(target, ".."), {recursive: true, mode: 0o755});
  if (targetExists) {
    const previous = `${target}.previous-${process.pid}`;
    await rename(target, previous);
    try { await rename(staging, target); } catch (error) { await rename(previous, target); throw error; }
    await rm(previous, {recursive: true});
  } else await rename(staging, target);
  console.log(JSON.stringify({status: "editable-master", city: sourceManifest.cityName, variants: files.length, target}));
} catch (error) {
  await rm(staging, {recursive: true, force: true});
  throw error;
}
