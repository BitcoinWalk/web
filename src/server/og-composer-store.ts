import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { bitcoinWalkMark } from "../domain/brand-marks";
import {
  ogCompositionSchema,
  type OgComposition,
  type OgSource,
} from "../domain/og-composer";
import { downloadPublicImage } from "./media-store";
import { readSponsorLogoAsset } from "./sponsor-logo-store";

const root = () =>
  join(
    process.env.BITCOINWALK_MEDIA_ROOT ||
      join(process.env.TMPDIR || "/tmp", "bitcoinwalk-media"),
    "og-composer",
  );
const sources = () => join(root(), "sources"),
  renders = () => join(root(), "renders"),
  MAX_BYTES = 10 * 1024 * 1024,
  MAX_PIXELS = 40_000_000;
const CANVAS_WIDTH = 1200,
  CANVAS_HEIGHT = 630,
  EDGE = 64,
  TEXT_WIDTH = CANVAS_WIDTH - EDGE * 2,
  ubuntuFont = readFile(
    join(
      process.cwd(),
      "design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf",
    ),
  ).then((body) => body.toString("base64"));
export type SavedOgComposition = {
  id: string;
  actor: string;
  title: string;
  createdAt: string;
  outputHash: string;
  composition: OgComposition;
};
const hash = (body: Buffer) => createHash("sha256").update(body).digest("hex");
const escapeXml = (value: string) =>
  value.replace(
    /[<>&'\"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character]!,
  );

async function atomic(path: string, body: Buffer | string) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temp = path + `.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, body, { mode: 0o600 });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
async function normalizedSource(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new Error("Images must be between 1 byte and 10 MB.");
  const image = sharp(bytes, {
      limitInputPixels: MAX_PIXELS,
      failOn: "warning",
    }),
    metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages || 1) > 1
  )
    throw new Error("Choose a valid JPEG, PNG or WebP image.");
  return image
    .rotate()
    .resize({
      width: 2400,
      height: 1260,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86, effort: 5 })
    .toBuffer();
}
export async function storeOgSource(
  bytes: Buffer,
  provenance: Omit<OgSource, "hash" | "dataUrl">,
  actor?: string,
) {
  const body = await normalizedSource(bytes),
    contentHash = hash(body),
    createdAt = new Date().toISOString();
  await atomic(join(sources(), contentHash + ".webp"), body);
  await atomic(
    join(sources(), contentHash + ".json"),
    JSON.stringify(
      { hash: contentHash, actor, createdAt, ...provenance },
      null,
      2,
    ),
  );
  return {
    hash: contentHash,
    dataUrl: `data:image/webp;base64,${body.toString("base64")}`,
    ...provenance,
  };
}
export async function importOgSource(sourceUrl: string, actor: string) {
  const url = new URL(sourceUrl);
  url.username = "";
  url.password = "";
  url.hash = "";
  return storeOgSource(
    await downloadPublicImage(sourceUrl),
    { source: "url", sourceUrl: url.href },
    actor,
  );
}
export async function assertOgGenerationBudget(actor: string) {
  const entries = await readdir(sources()).catch(() => []),
    cutoff = Date.now() - 86_400_000;
  let global = 0,
    own = 0;
  for (const name of entries.filter((name) =>
    /^[a-f0-9]{64}\.json$/.test(name),
  )) {
    try {
      const row = JSON.parse(await readFile(join(sources(), name), "utf8"));
      if (row.source === "generated" && Date.parse(row.createdAt) > cutoff) {
        global++;
        if (row.actor === actor) own++;
      }
    } catch {}
  }
  const daily = Math.max(
    1,
    Number(process.env.BITCOINWALK_IMAGE_DAILY_LIMIT || 10),
  );
  if (global >= daily)
    throw new Error(
      "Daily image-generation limit reached. Try again after the budget window resets.",
    );
  if (own >= 5)
    throw new Error(
      "Image-generation limit reached for this identity. Try again tomorrow.",
    );
}
export async function readOgSource(contentHash: string) {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) return null;
  try {
    const body = await readFile(join(sources(), contentHash + ".webp"));
    return hash(body) === contentHash ? body : null;
  } catch {
    return null;
  }
}
export async function readOwnedOgSource(actor: string, contentHash: string) {
  try {
    const meta = JSON.parse(
        await readFile(join(sources(), contentHash + ".json"), "utf8"),
      ),
      body = await readOgSource(contentHash);
    if (!body || meta.actor !== actor) return null;
    return {
      hash: contentHash,
      dataUrl: `data:image/webp;base64,${body.toString("base64")}`,
      source: meta.source,
      sourceUrl: meta.sourceUrl,
      prompt: meta.prompt,
      model: meta.model,
    } as OgSource;
  } catch {
    return null;
  }
}
function alignedX(
  align: "left" | "center" | "right",
  width: number,
) {
  return align === "left"
    ? EDGE
    : align === "right"
      ? CANVAS_WIDTH - EDGE - width
      : (CANVAS_WIDTH - width) / 2;
}
async function textSvg(layer: OgComposition["text"]) {
  if (!layer.value.trim()) return null;
  const maxChars = Math.max(
      8,
      Math.floor(TEXT_WIDTH / (layer.fontSize * 0.58)),
    ),
    words = layer.value.trim().split(/\s+/),
    lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, 3),
    height = Math.ceil(visible.length * layer.fontSize * 1.12 + 32),
    anchor =
      layer.align === "left"
        ? "start"
        : layer.align === "right"
          ? "end"
          : "middle",
    x =
      layer.align === "left"
        ? 16
        : layer.align === "right"
          ? TEXT_WIDTH - 16
          : TEXT_WIDTH / 2,
    panel =
      layer.treatment === "panel"
        ? `<rect width="${TEXT_WIDTH}" height="${height}" rx="18" fill="${layer.color === "#ffffff" ? "rgba(0,0,0,.68)" : "rgba(255,255,255,.84)"}"/>`
        : "",
    shadow =
      layer.treatment === "shadow"
        ? 'style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.72))"'
        : "";
  return Buffer.from(
    `<svg width="${TEXT_WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:UbuntuPinned;src:url(data:font/ttf;base64,${await ubuntuFont}) format("truetype");font-style:italic;font-weight:700}</style>${panel}<g ${shadow} fill="${layer.color}" font-family="UbuntuPinned" font-size="${layer.fontSize}" font-style="italic" font-weight="700" text-anchor="${anchor}">${visible.map((line, index) => `<text x="${x}" y="${24 + layer.fontSize * (index + 1)}">${escapeXml(line)}</text>`).join("")}</g></svg>`,
  );
}
async function backgroundLayer(composition: OgComposition) {
  const body = await readOgSource(composition.background.hash);
  if (!body) throw new Error("The selected background is missing or corrupt.");
  const zoom = composition.background.zoom,
    scaledWidth = Math.ceil(1200 * zoom),
    scaledHeight = Math.ceil(630 * zoom),
    left = Math.round(((scaledWidth - 1200) * composition.background.x) / 100),
    top = Math.round(((scaledHeight - 630) * composition.background.y) / 100);
  return sharp(body)
    .resize(scaledWidth, scaledHeight, { fit: "cover", position: "centre" })
    .extract({ left, top, width: 1200, height: 630 })
    .png()
    .toBuffer();
}
async function logoBody(layer: NonNullable<OgComposition["logo"]>) {
  const body =
    layer.source === "catalogue"
      ? await readSponsorLogoAsset(layer.hash)
      : await readOgSource(layer.hash);
  if (!body || hash(body) !== layer.hash)
    throw new Error(
      layer.source === "catalogue"
        ? "The approved catalogue artwork is unavailable."
        : "The uploaded partner artwork is unavailable.",
    );
  return sharp(body)
    .resize({
      width: Math.round(layer.width),
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}
export async function renderAndSaveOg(
  actor: string,
  input: unknown,
) {
  const composition = ogCompositionSchema.parse(input),
    layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (composition.mark.visible) {
    const selected = bitcoinWalkMark(composition.mark.variant),
      mark = await sharp(join(process.cwd(), "public", selected.path))
      .resize({
        width: Math.round(composition.mark.width),
        fit: "inside",
      })
      .png()
      .toBuffer(),
      metadata = await sharp(mark).metadata();
    const width = metadata.width ?? 0,
      height = metadata.height ?? 0,
      left = alignedX(composition.mark.align, width),
      top = 54;
    if (left < 0 || top + height > CANVAS_HEIGHT)
      throw new Error("Keep the BitcoinWalk mark inside the 1200 × 630 canvas.");
    layers.push({
      input: mark,
      left: Math.round(left),
      top,
    });
  }
  const text = await textSvg(composition.text);
  if (text) {
    const metadata = await sharp(text).metadata();
    const height = metadata.height ?? 0,
      top = Math.max(54, CANVAS_HEIGHT - EDGE - height);
    if (top + height > CANVAS_HEIGHT)
      throw new Error("Keep all text inside the 1200 × 630 canvas.");
    layers.push({
      input: text,
      left: EDGE,
      top: Math.round(top),
    });
  }
  if (composition.logo) {
    const logo = await logoBody(composition.logo),
      metadata = await sharp(logo).metadata();
    const width = metadata.width ?? 0,
      height = metadata.height ?? 0,
      left = alignedX(composition.logo.align, width),
      top = CANVAS_HEIGHT - EDGE - height;
    if (left < 0 || top < 0)
      throw new Error("Keep the partner logo inside the 1200 × 630 canvas.");
    layers.push({
      input: logo,
      left: Math.round(left),
      top: Math.round(top),
    });
  }
  const output = await sharp(await backgroundLayer(composition))
      .composite(layers)
      .png({ compressionLevel: 9 })
      .toBuffer(),
    outputHash = hash(output),
    id = randomUUID(),
    record: SavedOgComposition = {
      id,
      actor,
      title: composition.title,
      createdAt: new Date().toISOString(),
      outputHash,
      composition,
    };
  await atomic(join(renders(), outputHash + ".png"), output);
  await atomic(join(renders(), id + ".json"), JSON.stringify(record, null, 2));
  return {
    ...record,
    dataUrl: `data:image/png;base64,${output.toString("base64")}`,
  };
}
export async function listSavedOg(actor: string) {
  const entries = await readdir(renders()).catch(() => []),
    rows: SavedOgComposition[] = [];
  for (const name of entries.filter((name) =>
    /^[a-f0-9-]{36}\.json$/.test(name),
  )) {
    try {
      const row = JSON.parse(
        await readFile(join(renders(), name), "utf8"),
      ) as SavedOgComposition,
        parsed = ogCompositionSchema.safeParse(row.composition);
      if (
        row.actor === actor &&
        parsed.success &&
        /^[a-f0-9]{64}$/.test(row.outputHash)
      ) {
        row.composition = parsed.data;
        rows.push(row);
      }
    } catch {}
  }
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
}
export async function readSavedOg(actor: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  try {
    const row = JSON.parse(
      await readFile(join(renders(), id + ".json"), "utf8"),
    ) as SavedOgComposition;
    const parsed = ogCompositionSchema.safeParse(row.composition);
    if (row.actor !== actor || !parsed.success)
      return null;
    row.composition = parsed.data;
    const body = await readFile(join(renders(), row.outputHash + ".png"));
    if (hash(body) !== row.outputHash) return null;
    return {
      ...row,
      dataUrl: `data:image/png;base64,${body.toString("base64")}`,
    };
  } catch {
    return null;
  }
}
export async function ogStoreHealth() {
  await mkdir(root(), { recursive: true, mode: 0o700 });
  return stat(root());
}
