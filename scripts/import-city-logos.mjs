// Usage: node scripts/import-city-logos.mjs radom /path/to/unpacked-pngs
// Import reviewed Figma exports only. Existing published packs are never replaced.
import {readFile, readdir, mkdir, mkdtemp, copyFile, writeFile, rename, lstat} from "node:fs/promises";
import {resolve, join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {findLogoCity, parseLogoManifest} from "../src/lib/city-logo-packs.ts";

const [slug, input] = process.argv.slice(2);
const city = findLogoCity(slug);
if (!city || !input) throw new Error("Supply a reviewed city slug and a directory containing its ten exported PNGs.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "public", "city-logos", slug);
if (await lstat(destination).catch(() => null)) throw new Error("Pack already exists; review a versioned update instead of overwriting it.");
const sourceFiles = await readdir(resolve(input));
const variants = ["bitcoinwalk-vertical", "bitcoinwalk", "bitcoinwalk-horizontal", "satsman", "satsman-vertical"];
const sha256 = data => createHash("sha256").update(data).digest("hex");
const files = [];
for (const background of ["black", "white"]) {
  for (const variant of variants) {
    const suffix = `${variant}-on-${background}.png`;
    const matches = sourceFiles.filter(name => name === `-${suffix}` || name === suffix || name === `${slug}-${suffix}`);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${suffix}`);
    const path = join(resolve(input), matches[0]);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error(`Invalid export: ${matches[0]}`);
    const bytes = await readFile(path);
    const metadata = await sharp(bytes, {limitInputPixels: 40_000_000}).metadata();
    if (metadata.format !== "png" || !metadata.hasAlpha) throw new Error(`Expected transparent PNG: ${matches[0]}`);
    files.push({path, entry: {
      name: `${slug}-${suffix}`,
      label: `${variant.replaceAll("-", " ")} · ${background === "black" ? "dark" : "light"} background`,
      background: background === "black" ? "dark" : "light",
      width: metadata.width, height: metadata.height, sha256: sha256(bytes),
    }});
  }
}
const staging = await mkdtemp(join(root, ".logo-import-"));
for (const file of files) await copyFile(file.path, join(staging, file.entry.name));
const archiveName = `${slug}-logos.zip`;
execFileSync("zip", ["-X", "-q", archiveName, ...files.map(file => file.entry.name).sort()], {cwd: staging});
const pack = parseLogoManifest({
  version: 1, ...city,
  source: "https://www.figma.com/design/4Plc48s7zBJXhx2aG9lKHv",
  templateVersion: "city-logo-pilots-1", files: files.map(file => file.entry),
  archive: {name: archiveName, sha256: sha256(await readFile(join(staging, archiveName)))},
}, slug);
await writeFile(join(staging, "manifest.json"), JSON.stringify(pack, null, 2) + "\n");
await mkdir(dirname(destination), {recursive: true});
await rename(staging, destination);
console.log(`Imported ${pack.files.length} PNGs for ${city.cityName}. Review previews before deployment.`);
