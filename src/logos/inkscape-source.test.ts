import {describe, expect, it} from "vitest";
import {
  buildInkscapeEditableSvg,
  buildInkscapeReferenceSvg,
  cityLogoEditableLayouts,
  cityLogoVariants,
  parseInkscapeSourceManifest,
} from "./inkscape-source";

const input = {
  cityId: "032d98ea-f5da-4826-95bd-c4cf9286716e",
  cityName: "Warszawa",
  slug: "warszawa",
  variant: "bitcoinwalk-on-white" as const,
  width: 775,
  height: 604,
  sourcePng: "warszawa-bitcoinwalk-on-white.png",
  sourceSha256: "a".repeat(64),
  pngBase64: Buffer.from("reference pixels").toString("base64"),
};

describe("Inkscape city-logo source migration", () => {
  it("wraps the exact approved PNG in a locked, self-contained reference layer", () => {
    const svg = buildInkscapeReferenceSvg(input);
    expect(svg).toContain('xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"');
    expect(svg).toContain('inkscape:label="Approved Figma reference — locked"');
    expect(svg).toContain('sodipodi:insensitive="true"');
    expect(svg).toContain(`data:image/png;base64,${input.pngBase64}`);
    expect(svg).toContain(input.sourceSha256);
    expect(svg).toContain('inkscape:label="Editable Inkscape reconstruction — pending"');
  });

  it("escapes metadata rather than allowing SVG markup injection", () => {
    const svg = buildInkscapeReferenceSvg({...input, cityName: 'A & <script>"'});
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("A &amp; &lt;script&gt;&quot;");
  });

  it("rejects unsafe identity, geometry and image input", () => {
    expect(() => buildInkscapeReferenceSvg({...input, slug: "../warszawa"})).toThrow();
    expect(() => buildInkscapeReferenceSvg({...input, width: 0})).toThrow();
    expect(() => buildInkscapeReferenceSvg({...input, pngBase64: "not base64!"})).toThrow();
  });

  it("accepts a complete ten-variant reference-preservation manifest", () => {
    const files = ["black", "white"].flatMap(background =>
      ["bitcoinwalk-vertical", "bitcoinwalk", "bitcoinwalk-horizontal", "satsman", "satsman-vertical"].map(variant => ({
        variant: `${variant}-on-${background}`,
        svg: `${variant}-on-${background}.svg`,
        sourcePng: `warszawa-${variant}-on-${background}.png`,
        sourceSha256: "b".repeat(64),
        width: 500,
        height: 500,
      })),
    );
    expect(parseInkscapeSourceManifest({
      schemaVersion: 1,
      status: "reference-preserved",
      cityId: input.cityId,
      cityName: input.cityName,
      slug: input.slug,
      source: "https://www.figma.com/design/example",
      files,
    }).files).toHaveLength(10);
  });

  it("rejects incomplete or duplicate variant manifests", () => {
    const file = {variant: "bitcoinwalk-on-white", svg: "bitcoinwalk-on-white.svg", sourcePng: input.sourcePng, sourceSha256: input.sourceSha256, width: 775, height: 604};
    expect(() => parseInkscapeSourceManifest({schemaVersion: 1, status: "reference-preserved", cityId: input.cityId, cityName: input.cityName, slug: input.slug, source: "https://example.com", files: [file]})).toThrow();
    expect(() => parseInkscapeSourceManifest({schemaVersion: 1, status: "reference-preserved", cityId: input.cityId, cityName: input.cityName, slug: input.slug, source: "https://example.com", files: Array(10).fill(file)})).toThrow();
  });

  it("defines a reviewed editable text region for every approved layout", () => {
    expect(Object.keys(cityLogoEditableLayouts).sort()).toEqual([...cityLogoVariants].sort());
    for (const layout of Object.values(cityLogoEditableLayouts)) {
      expect(layout.cityText.width).toBeGreaterThan(0);
      expect(layout.cityText.height).toBeGreaterThan(0);
      expect(layout.cityText.fontSize).toBe(64);
      expect(layout.cityText.baseline).toBeGreaterThan(layout.cityText.y);
    }
  });

  it("builds a self-contained Inkscape master with locked brand art and live city text", () => {
    const svg = buildInkscapeEditableSvg(input);
    const layout = cityLogoEditableLayouts[input.variant];
    expect(svg).toContain('inkscape:label="Approved brand artwork — locked"');
    expect(svg).toContain('sodipodi:insensitive="true"');
    expect(svg).toContain('inkscape:label="Editable city name"');
    expect(svg).toContain('data:image/png;base64,');
    expect(svg).toContain('font-family="Ubuntu"');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('data-bitcoinwalk-field="city-name"');
    expect(svg).toContain(`textLength="${layout.cityText.width}"`);
    expect(svg).toContain(">WARSZAWA</text>");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toMatch(/href="https?:/);
  });

  it("does not use renderer-dependent SVG clipping for the historical artifact correction",()=>{
    expect(buildInkscapeEditableSvg({...input,variant:"bitcoinwalk-on-black"})).not.toContain("clip-path");
    expect(buildInkscapeEditableSvg(input)).not.toContain("brand-clip");
  });

  it("normalizes the editable city label without accepting markup", () => {
    const svg = buildInkscapeEditableSvg({...input, cityName: "  Łódź & <City>  "});
    expect(svg).toContain(">ŁÓDŹ &amp; &lt;CITY&gt;</text>");
    expect(svg).not.toContain("<City>");
  });
});
