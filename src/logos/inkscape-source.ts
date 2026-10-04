import {z} from "zod";

export const cityLogoVariants = [
  "bitcoinwalk-vertical-on-black",
  "bitcoinwalk-on-black",
  "bitcoinwalk-horizontal-on-black",
  "satsman-on-black",
  "satsman-vertical-on-black",
  "bitcoinwalk-vertical-on-white",
  "bitcoinwalk-on-white",
  "bitcoinwalk-horizontal-on-white",
  "satsman-on-white",
  "satsman-vertical-on-white",
] as const;

export type CityLogoVariant = (typeof cityLogoVariants)[number];

type EditableLayout = {
  cityText: {
    x: number;
    y: number;
    width: number;
    height: number;
    baseline: number;
    fontSize: number;
  };
  erase: {x: number; y: number; width: number; height: number; fill: string | null};
};

// These measurements are taken from the three approved pilot-city layouts.
// The city label is the only variable element; the approved brand pixels stay
// locked and are never redrawn by the generator.
export const cityLogoEditableLayouts: Record<CityLogoVariant, EditableLayout> = {
  "bitcoinwalk-horizontal-on-black": {
    cityText: {x: 1106.5, y: 304, width: 359, height: 47, baseline: 350, fontSize: 64},
    erase: {x: 820, y: 299, width: 575, height: 1000, fill: null},
  },
  "bitcoinwalk-horizontal-on-white": {
    cityText: {x: 1106.5, y: 304, width: 359, height: 47, baseline: 350, fontSize: 64},
    erase: {x: 820, y: 299, width: 575, height: 1000, fill: "#F6F6F6"},
  },
  "bitcoinwalk-on-black": {
    cityText: {x: 381, y: 440, width: 359, height: 47, baseline: 486, fontSize: 64},
    erase: {x: 110, y: 434, width: 540, height: 1000, fill: null},
  },
  "bitcoinwalk-on-white": {
    cityText: {x: 381, y: 440, width: 359, height: 47, baseline: 486, fontSize: 64},
    erase: {x: 110, y: 434, width: 540, height: 1000, fill: null},
  },
  "bitcoinwalk-vertical-on-black": {
    cityText: {x: 379.5, y: 542, width: 358, height: 47, baseline: 588, fontSize: 64},
    erase: {x: 100, y: 536, width: 550, height: 1000, fill: null},
  },
  "bitcoinwalk-vertical-on-white": {
    cityText: {x: 374.5, y: 548, width: 358, height: 47, baseline: 594, fontSize: 64},
    erase: {x: 100, y: 542, width: 550, height: 1000, fill: null},
  },
  "satsman-on-black": {
    cityText: {x: 253, y: 322, width: 359, height: 47, baseline: 368, fontSize: 64},
    erase: {x: 10, y: 316, width: 480, height: 1000, fill: null},
  },
  "satsman-on-white": {
    cityText: {x: 253, y: 314, width: 359, height: 47, baseline: 360, fontSize: 64},
    erase: {x: 10, y: 308, width: 480, height: 1000, fill: "#F6F6F6"},
  },
  "satsman-vertical-on-black": {
    cityText: {x: 248.5, y: 476, width: 358, height: 46, baseline: 521, fontSize: 64},
    erase: {x: 0, y: 469, width: 490, height: 1000, fill: "#F6F6F6"},
  },
  "satsman-vertical-on-white": {
    cityText: {x: 248.5, y: 475, width: 358, height: 47, baseline: 521, fontSize: 64},
    erase: {x: 0, y: 468, width: 490, height: 1000, fill: "#F6F6F6"},
  },
};

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const safeName = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dimension = z.number().int().positive().max(16000);
const variant = z.enum(cityLogoVariants);

const sourceFile = z.object({
  variant,
  svg: z.string().regex(/^[a-z0-9-]+\.svg$/),
  sourcePng: z.string().regex(/^[a-z0-9-]+\.png$/),
  sourceSha256: sha256,
  width: dimension,
  height: dimension,
}).strict();

const manifest = z.object({
  schemaVersion: z.literal(1),
  status: z.literal("reference-preserved"),
  cityId: z.uuid(),
  cityName: z.string().trim().min(1).max(100),
  slug: safeName,
  source: z.url().refine(value => new URL(value).protocol === "https:", "Source must use HTTPS"),
  files: z.array(sourceFile).length(cityLogoVariants.length),
}).strict();

export type InkscapeSourceManifest = z.infer<typeof manifest>;

export function parseInkscapeSourceManifest(value: unknown): InkscapeSourceManifest {
  const parsed = manifest.parse(value);
  const variants = parsed.files.map(file => file.variant);
  if (new Set(variants).size !== cityLogoVariants.length || cityLogoVariants.some(name => !variants.includes(name))) {
    throw new Error("Inkscape source manifest must contain each logo variant exactly once");
  }
  for (const file of parsed.files) {
    if (file.svg !== `${file.variant}.svg`) throw new Error("SVG filename must match its variant");
    if (file.sourcePng !== `${parsed.slug}-${file.variant}.png`) throw new Error("PNG filename must match its city and variant");
  }
  return parsed;
}

const referenceInput = z.object({
  cityId: z.uuid(),
  cityName: z.string().trim().min(1).max(100),
  slug: safeName,
  variant,
  width: dimension,
  height: dimension,
  sourcePng: z.string().regex(/^[a-z0-9-]+\.png$/),
  sourceSha256: sha256,
  pngBase64: z.string().min(4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  cityText: z.object({
    x: z.number().nonnegative().max(16000),
    width: z.number().positive().max(16000),
    baseline: z.number().positive().max(16000),
    fontSize: z.number().positive().max(1000).optional(),
  }).strict().optional(),
  eraseFill: z.union([z.string().regex(/^#[A-Fa-f0-9]{6}$/), z.null()]).optional(),
}).strict();

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function buildInkscapeReferenceSvg(value: z.input<typeof referenceInput>): string {
  const input = referenceInput.parse(value);
  const title = `${input.cityName} — ${input.variant}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
  <title>${xml(title)}</title>
  <metadata>
    <bitcoinwalk:source xmlns:bitcoinwalk="https://bitcoinwalk.org/ns/city-logo-source/1"
      city-id="${input.cityId}" city="${xml(input.cityName)}" variant="${input.variant}"
      png="${input.sourcePng}" sha256="${input.sourceSha256}" status="reference-preserved" />
  </metadata>
  <sodipodi:namedview pagecolor="#202124" bordercolor="#666666" inkscape:document-units="px" />
  <g inkscape:groupmode="layer" inkscape:label="Approved Figma reference — locked" sodipodi:insensitive="true">
    <image x="0" y="0" width="${input.width}" height="${input.height}"
      preserveAspectRatio="none" xlink:href="data:image/png;base64,${input.pngBase64}" />
  </g>
  <g inkscape:groupmode="layer" inkscape:label="Editable Inkscape reconstruction — pending" />
</svg>
`;
}

export function buildInkscapeEditableSvg(value: z.input<typeof referenceInput>): string {
  const input = referenceInput.parse(value);
  const layout = cityLogoEditableLayouts[input.variant];
  const cityText = input.cityText ?? layout.cityText;
  const title = `${input.cityName} — ${input.variant} — editable master`;
  const label = input.cityName.trim().toLocaleUpperCase("en-US");
  const maskId = `brand-mask-${input.variant}`;
  const textFill = input.variant.endsWith("on-black") ? "#FFFFFF" : "#4D4D4D";
  const eraseFill = input.eraseFill === undefined ? layout.erase.fill : input.eraseFill;
  const background = eraseFill
    ? `    <rect x="${layout.erase.x}" y="${layout.erase.y}" width="${layout.erase.width}" height="${layout.erase.height}" fill="${eraseFill}" />\n`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
  <title>${xml(title)}</title>
  <metadata>
    <bitcoinwalk:source xmlns:bitcoinwalk="https://bitcoinwalk.org/ns/city-logo-source/1"
      city-id="${input.cityId}" city="${xml(input.cityName)}" variant="${input.variant}"
      png="${input.sourcePng}" sha256="${input.sourceSha256}" status="editable-master" />
  </metadata>
  <sodipodi:namedview pagecolor="#202124" bordercolor="#666666" inkscape:document-units="px" />
  <defs>
    <style><![CDATA[
      @font-face { font-family: "Ubuntu"; src: url("../../fonts/Ubuntu-BoldItalic.ttf") format("truetype"); font-style: italic; font-weight: 700; }
    ]]></style>
    <mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${input.width}" height="${input.height}">
      <rect width="${input.width}" height="${input.height}" fill="#fff" />
      <rect x="${layout.erase.x}" y="${layout.erase.y}" width="${layout.erase.width}" height="${layout.erase.height}" fill="#000" />
    </mask>
  </defs>
${background}  <g inkscape:groupmode="layer" inkscape:label="Approved brand artwork — locked" sodipodi:insensitive="true" mask="url(#${maskId})">
    <image x="0" y="0" width="${input.width}" height="${input.height}"
      preserveAspectRatio="none" xlink:href="data:image/png;base64,${input.pngBase64}" />
  </g>
  <g inkscape:groupmode="layer" inkscape:label="Editable city name">
    <text x="${cityText.x}" y="${cityText.baseline}" text-anchor="middle"
      font-family="Ubuntu" font-size="${cityText.fontSize ?? layout.cityText.fontSize}" font-style="italic" font-weight="700"
      fill="${textFill}" textLength="${cityText.width}" lengthAdjust="spacingAndGlyphs"
      data-bitcoinwalk-field="city-name">${xml(label)}</text>
  </g>
</svg>
`;
}
