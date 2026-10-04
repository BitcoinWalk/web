import {createHash} from "node:crypto";
import {mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import sharp from "sharp";
import {z} from "zod";
import {buildInkscapeEditableSvg, cityLogoEditableLayouts, cityLogoVariants} from "./inkscape-source.ts";
import {correctHistoricalLogoSource} from "./source-artifact.ts";

export const cityLogoTemplateVersion = "city-logo-inkscape-v1.2";
const sourceSlug = "szydlowiec";
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safeArchiveName = /^[a-z0-9][a-z0-9.-]{0,199}$/;

const renderRequest = z.object({
  cityId: z.uuid(),
  cityName: z.string().transform(value => value.trim().normalize("NFC")).pipe(z.string().min(1).max(64).refine(value => !/[\u0000-\u001f\u007f]/u.test(value), "City name contains control characters")),
  slug: z.string().regex(safeSlug),
  locale: z.string().min(2).max(35).refine(value => {
    try { new Intl.Locale(value); return true; } catch { return false; }
  }, "Invalid locale"),
  templateVersion: z.literal(cityLogoTemplateVersion).default(cityLogoTemplateVersion),
}).strict();

export type CityLogoRenderRequest = z.output<typeof renderRequest>;

export function parseCityLogoRenderRequest(value: unknown): CityLogoRenderRequest {
  return renderRequest.parse(value);
}

function u16(view: DataView, offset: number) { return view.getUint16(offset, false); }
function u32(view: DataView, offset: number) { return view.getUint32(offset, false); }

function cmapLookup(font: Buffer, codePoint: number): number {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tableCount = u16(view, 4);
  let cmapOffset = -1;
  for (let index = 0; index < tableCount; index += 1) {
    const offset = 12 + index * 16;
    const tag = font.subarray(offset, offset + 4).toString("ascii");
    if (tag === "cmap") cmapOffset = u32(view, offset + 8);
  }
  if (cmapOffset < 0 || cmapOffset + 4 > font.length) throw new Error("Pinned font has no readable cmap table");
  const subtables = u16(view, cmapOffset + 2);
  const candidates: Array<{offset: number; format: 4 | 12}> = [];
  for (let index = 0; index < subtables; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = u16(view, record);
    const encoding = u16(view, record + 2);
    const subtable = cmapOffset + u32(view, record + 4);
    const format = u16(view, subtable);
    if ((platform === 0 || platform === 3) && (format === 4 || format === 12)) {
      candidates.push({offset: subtable, format});
      void encoding;
    }
  }
  for (const candidate of candidates.sort((a, b) => b.format - a.format)) {
    const {offset, format} = candidate;
    if (format === 12) {
      const groups = u32(view, offset + 12);
      for (let index = 0; index < groups; index += 1) {
        const group = offset + 16 + index * 12;
        const start = u32(view, group);
        const end = u32(view, group + 4);
        if (codePoint >= start && codePoint <= end) return u32(view, group + 8) + codePoint - start;
      }
    } else {
      if (codePoint > 0xffff) continue;
      const segments = u16(view, offset + 6) / 2;
      const endCodes = offset + 14;
      const startCodes = endCodes + segments * 2 + 2;
      const deltas = startCodes + segments * 2;
      const ranges = deltas + segments * 2;
      for (let index = 0; index < segments; index += 1) {
        const end = u16(view, endCodes + index * 2);
        const start = u16(view, startCodes + index * 2);
        if (codePoint < start || codePoint > end) continue;
        const range = u16(view, ranges + index * 2);
        if (range === 0) return (codePoint + u16(view, deltas + index * 2)) & 0xffff;
        const glyphOffset = ranges + index * 2 + range + (codePoint - start) * 2;
        if (glyphOffset + 2 > font.length) return 0;
        const glyph = u16(view, glyphOffset);
        return glyph === 0 ? 0 : (glyph + u16(view, deltas + index * 2)) & 0xffff;
      }
    }
  }
  return 0;
}

export function fontSupportsText(font: Buffer, text: string): boolean {
  for (const character of text.normalize("NFC")) {
    const codePoint = character.codePointAt(0)!;
    if (/\s/u.test(character)) continue;
    if (cmapLookup(font, codePoint) === 0) return false;
  }
  return true;
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

async function measureText(text: string, fontSize: number, font: Buffer): Promise<{width: number; height: number}> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="300"><style>@font-face{font-family:UbuntuPinned;src:url(data:font/ttf;base64,${font.toString("base64")}) format("truetype");font-style:italic;font-weight:700}</style><text x="100" y="210" font-family="UbuntuPinned" font-size="${fontSize}" font-style="italic" font-weight="700" fill="#fff">${xml(text)}</text></svg>`;
  const {data, info} = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let minX = info.width; let maxX = -1; let minY = info.height; let maxY = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if (data[(y * info.width + x) * 4 + 3] === 0) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < minX) throw new Error("City label rendered no pixels");
  return {width: maxX - minX + 1, height: maxY - minY + 1};
}

export async function fitCityLabel(text: string, options: {maxWidth: number; maxFontSize: number; minFontSize: number; font?: Buffer}) {
  const font = options.font ?? await readFile(join(process.cwd(), "design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf"));
  for (let fontSize = options.maxFontSize; fontSize >= options.minFontSize; fontSize -= 1) {
    const measured = await measureText(text, fontSize, font);
    if (measured.width <= options.maxWidth) return {...measured, fontSize, scaleX: 1 as const};
  }
  throw new Error("City name cannot fit safely; manual review is required");
}

const crcTable = Array.from({length: 256}, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildDeterministicZip(files: Array<{name: string; data: Buffer}>): Buffer {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const local: Buffer[] = []; const central: Buffer[] = [];
  let offset = 0;
  for (const file of sorted) {
    if (!safeArchiveName.test(file.name) || file.name.includes("..")) throw new Error(`Unsafe ZIP filename: ${file.name}`);
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(file.data.length, 18); header.writeUInt32LE(file.data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, file.data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(0x0314, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(0, 10); entry.writeUInt16LE(0, 12); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(file.data.length, 20); entry.writeUInt32LE(file.data.length, 24); entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE((0o100644 * 65536) >>> 0, 38); entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + file.data.length;
  }
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralData, end]);
}

function sha256(data: Buffer) { return createHash("sha256").update(data).digest("hex"); }

export async function renderCityLogoPack(value: unknown, outputRoot: string) {
  const request = parseCityLogoRenderRequest(value);
  const projectRoot = process.cwd();
  const font = await readFile(join(projectRoot, "design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf"));
  const label = request.cityName.toLocaleUpperCase(request.locale);
  if (!fontSupportsText(font, label)) throw new Error("Pinned city-logo font does not contain every requested glyph");
  const evidenceRoot=join(projectRoot,"design/city-logo-templates/v1/examples/prototype-packs");
  const sourceManifest = JSON.parse(await readFile(join(evidenceRoot, sourceSlug, "manifest.json"), "utf8"));
  const root = resolve(outputRoot);
  await mkdir(root, {recursive: true});
  const destination = join(root, request.slug);
  const temporary = join(root, `.${request.slug}.building-${process.pid}`);
  await rm(temporary, {recursive: true, force: true});
  await mkdir(temporary, {recursive: false});
  try {
    const rendered: Array<{name: string; data: Buffer}> = [];
    const files = [];
    for (const variant of cityLogoVariants) {
      const sourceFile = sourceManifest.files.find((file: {name: string}) => file.name === `${sourceSlug}-${variant}.png`);
      if (!sourceFile) throw new Error(`Missing pinned source variant: ${variant}`);
      const historicalPng = await readFile(join(evidenceRoot, sourceSlug, sourceFile.name));
      const png = await correctHistoricalLogoSource(variant, historicalPng);
      const layout = cityLogoEditableLayouts[variant];
      const fit = await fitCityLabel(label, {maxWidth: layout.erase.width - 40, maxFontSize: 64, minFontSize: 28, font});
      let svg = buildInkscapeEditableSvg({
        cityId: request.cityId, cityName: request.cityName, slug: request.slug, variant,
        width: sourceFile.width, height: sourceFile.height, sourcePng: sourceFile.name,
        sourceSha256: sourceFile.sha256, pngBase64: png.toString("base64"), eraseFill: null,
        cityText: {x: layout.cityText.x, width: fit.width, baseline: layout.cityText.baseline, fontSize: fit.fontSize},
      });
      svg = svg.replace('url("../../fonts/Ubuntu-BoldItalic.ttf")', `url("data:font/ttf;base64,${font.toString("base64")}")`)
        .replace(/\s+textLength="[^"]+"\s+lengthAdjust="[^"]+"/, "");
      const output = await sharp(Buffer.from(svg)).png({compressionLevel: 9, adaptiveFiltering: false, palette: false}).toBuffer();
      const metadata = await sharp(output).metadata();
      const stats = await sharp(output).ensureAlpha().stats();
      if (metadata.width !== sourceFile.width || metadata.height !== sourceFile.height || stats.channels[3].min !== 0) throw new Error(`Rendered ${variant} failed transparent geometry validation`);
      const name = `${request.slug}-${variant}.png`;
      await writeFile(join(temporary, name), output, {flag: "wx"});
      rendered.push({name, data: output});
      files.push({name, label: variant.replaceAll("-", " "), background: variant.endsWith("on-black") ? "dark" : "light", width: metadata.width, height: metadata.height, sha256: sha256(output), transparent: true});
    }
    const archiveName = `${request.slug}-logos.zip`;
    const archive = buildDeterministicZip(rendered);
    await writeFile(join(temporary, archiveName), archive, {flag: "wx"});
    const manifest = {
      version: 1, cityId: request.cityId, slug: request.slug, cityName: request.cityName, locale: request.locale,
      source: "bitcoinwalk:city-logo-renderer" as const, templateVersion: request.templateVersion,
      files, archive: {name: archiveName, sha256: sha256(archive)},
    };
    await writeFile(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {flag: "wx"});
    await rename(temporary, destination);
    return manifest;
  } catch (error) {
    await rm(temporary, {recursive: true, force: true});
    throw error;
  }
}
