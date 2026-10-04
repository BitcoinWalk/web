#!/usr/bin/env node
import {createHash} from "node:crypto";
import {copyFile, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import process from "node:process";
import sharp from "sharp";
import {buildInkscapeReferenceSvg, cityLogoVariants, parseInkscapeSourceManifest} from "../src/logos/inkscape-source.ts";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [slug, partialLayoutPath] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  fail("Usage: node scripts/migrate-city-logo-source-to-inkscape.mjs <slug> [partial-layout-json]");
}

const project = process.cwd();
const publicPack = resolve(project, "public", "city-logos", slug);
const sourceManifestPath = join(publicPack, "manifest.json");
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const target = resolve(project, "design", "city-logo-templates", "v1", "reference-masters", slug);
const staging = `${target}.building-${process.pid}`;

try {
  await stat(target);
  fail(`Refusing to overwrite existing Inkscape source: ${target}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await mkdir(staging, {recursive: true, mode: 0o755});
try {
  const files = [];
  for (const variant of cityLogoVariants) {
    const sourcePng = `${slug}-${variant}.png`;
    const source = sourceManifest.files.find(file => file.name === sourcePng);
    if (!source) throw new Error(`Missing approved reference: ${sourcePng}`);
    const png = await readFile(join(publicPack, sourcePng));
    const digest = createHash("sha256").update(png).digest("hex");
    if (digest !== source.sha256) throw new Error(`Approved PNG checksum mismatch: ${sourcePng}`);

    const svgName = `${variant}.svg`;
    const svg = buildInkscapeReferenceSvg({
      cityId: sourceManifest.cityId,
      cityName: sourceManifest.cityName,
      slug,
      variant,
      width: source.width,
      height: source.height,
      sourcePng,
      sourceSha256: digest,
      pngBase64: png.toString("base64"),
    });
    const svgPath = join(staging, svgName);
    await writeFile(svgPath, svg, {encoding: "utf8", mode: 0o644});

    const [approvedPixels, migratedPixels] = await Promise.all([
      sharp(png).ensureAlpha().raw().toBuffer(),
      sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer(),
    ]);
    let changedChannels = 0;
    let largestDifference = 0;
    for (let index = 0; index < approvedPixels.length; index += 1) {
      const difference = Math.abs(approvedPixels[index] - migratedPixels[index]);
      if (difference) changedChannels += 1;
      if (difference > largestDifference) largestDifference = difference;
    }
    // librsvg may round a premultiplied alpha channel by one unit while decoding
    // an embedded PNG. The original PNG bytes remain embedded and checksummed.
    if (largestDifference > 1 || changedChannels / approvedPixels.length > 0.01) {
      throw new Error(`SVG reference parity failed: ${sourcePng}`);
    }
    files.push({variant, svg: svgName, sourcePng, sourceSha256: digest, width: source.width, height: source.height});
  }

  const migrationManifest = parseInkscapeSourceManifest({
    schemaVersion: 1,
    status: "reference-preserved",
    cityId: sourceManifest.cityId,
    cityName: sourceManifest.cityName,
    slug,
    source: sourceManifest.source,
    files,
  });
  await writeFile(join(staging, "manifest.json"), `${JSON.stringify(migrationManifest, null, 2)}\n`, {mode: 0o644});

  if (partialLayoutPath) {
    const partial = resolve(partialLayoutPath);
    if (basename(partial) !== "template-layouts.partial.json") throw new Error("Unexpected partial-layout evidence filename");
    await copyFile(partial, join(staging, "figma-layouts.partial.json"));
  }

  await mkdir(dirname(target), {recursive: true, mode: 0o755});
  await rename(staging, target);
  console.log(JSON.stringify({status: "reference-preserved", city: sourceManifest.cityName, variants: files.length, target}));
} catch (error) {
  await rm(staging, {recursive: true, force: true});
  throw error;
}
