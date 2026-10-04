import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import sharp from "sharp";
import {
  buildDeterministicZip,
  fitCityLabel,
  fontSupportsText,
  parseCityLogoRenderRequest,
  renderCityLogoPack,
} from "./city-logo-renderer";

const roots: string[] = [];
async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "bitcoinwalk-city-logo-"));
  roots.push(root);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true}))));

describe("city-logo renderer input", () => {
  it("normalizes Unicode names and validates bounded, path-safe identity", () => {
    const request = parseCityLogoRenderRequest({
      cityId: "032d98ea-f5da-4826-95bd-c4cf9286716e",
      cityName: "  Szydłowiec  ",
      slug: "szydlowiec",
      locale: "pl-PL",
    });
    expect(request.cityName).toBe("Szydłowiec");
    expect(request.templateVersion).toBe("city-logo-inkscape-v1.2");
    expect(() => parseCityLogoRenderRequest({...request, slug: "../escape"})).toThrow();
    expect(() => parseCityLogoRenderRequest({...request, cityName: "x".repeat(65)})).toThrow();
    expect(() => parseCityLogoRenderRequest({...request, locale: "not_a_locale"})).toThrow();
    expect(() => parseCityLogoRenderRequest({...request, cityName: "City\u0000"})).toThrow();
  });

  it("checks every rendered character against the pinned Ubuntu font", async () => {
    const font = await readFile(join(process.cwd(), "design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf"));
    expect(fontSupportsText(font, "ŁÓDŹ — SZYDŁOWIEC")).toBe(true);
    expect(fontSupportsText(font, "CITY 😀")).toBe(false);
  });
});

describe("city-label fitting", () => {
  it("reduces font size uniformly without horizontal stretching", async () => {
    const fit = await fitCityLabel("WARSZAWA", {maxWidth: 440, maxFontSize: 64, minFontSize: 28});
    const longer = await fitCityLabel("SZYDŁOWIEC", {maxWidth: 440, maxFontSize: 64, minFontSize: 28});
    expect(fit.scaleX).toBe(1);
    expect(longer.scaleX).toBe(1);
    expect(longer.fontSize).toBeLessThanOrEqual(fit.fontSize);
    expect(longer.width).toBeLessThanOrEqual(440);
  });

  it("fails for review when a name cannot fit at the minimum size", async () => {
    await expect(fitCityLabel("A VERY LONG CITY NAME THAT CANNOT FIT SAFELY", {
      maxWidth: 180,
      maxFontSize: 64,
      minFontSize: 48,
    })).rejects.toThrow(/manual review/i);
  });
});

describe("deterministic city-logo publication", () => {
  it("builds byte-identical ZIP archives independent of input order", () => {
    const a = buildDeterministicZip([{name: "b.txt", data: Buffer.from("b")}, {name: "a.txt", data: Buffer.from("a")}]);
    const b = buildDeterministicZip([{name: "a.txt", data: Buffer.from("a")}, {name: "b.txt", data: Buffer.from("b")}]);
    expect(a.equals(b)).toBe(true);
    expect(() => buildDeterministicZip([{name: "../escape", data: Buffer.alloc(0)}])).toThrow();
  });

  it("renders ten transparent PNGs, a manifest and a stable archive atomically", async () => {
    const first = await temporaryRoot();
    const second = await temporaryRoot();
    const request = {
      cityId: "032d98ea-f5da-4826-95bd-c4cf9286716e",
      cityName: "Warszawa",
      slug: "warszawa-generated",
      locale: "pl-PL",
    };
    const one = await renderCityLogoPack(request, first);
    const two = await renderCityLogoPack(request, second);
    expect(one.files).toHaveLength(10);
    expect(one.templateVersion).toBe("city-logo-inkscape-v1.2");
    expect(one.source).toBe("bitcoinwalk:city-logo-renderer");
    expect(two.archive.sha256).toBe(one.archive.sha256);
    expect(one.files.every(file => file.transparent)).toBe(true);
    const corrected=await sharp(join(first,request.slug,`${request.slug}-bitcoinwalk-on-black.png`)).ensureAlpha().extract({left:293,top:0,width:189,height:1}).raw().toBuffer({resolveWithObject:true});
    for(let offset=3;offset<corrected.data.length;offset+=corrected.info.channels) expect(corrected.data[offset]).toBe(0);
    const brand=await sharp(join(first,request.slug,`${request.slug}-bitcoinwalk-on-black.png`)).ensureAlpha().extract({left:180,top:100,width:420,height:320}).raw().toBuffer({resolveWithObject:true});
    let visibleBrandPixels=0;
    for(let offset=3;offset<brand.data.length;offset+=brand.info.channels) if(brand.data[offset]>0) visibleBrandPixels+=1;
    expect(visibleBrandPixels).toBeGreaterThan(20_000);
    expect((await readdir(join(first, request.slug))).sort()).toEqual((await readdir(join(second, request.slug))).sort());
    for (const name of await readdir(join(first, request.slug))) {
      expect((await readFile(join(first, request.slug, name))).equals(await readFile(join(second, request.slug, name)))).toBe(true);
    }
  }, 30_000);

  it.each([
    {cityName: "Radom", slug: "radom-short"},
    {cityName: "Szydłowiec", slug: "szydlowiec-diacritic"},
  ])("renders the $slug fitting fixture without clipping", async ({cityName, slug}) => {
    const root = await temporaryRoot();
    const manifest = await renderCityLogoPack({
      cityId: "e64cbf2b-4e46-4364-98c0-580c73e8dc24",
      cityName,
      slug,
      locale: "pl-PL",
    }, root);
    expect(manifest.files).toHaveLength(10);
    expect(manifest.files.every(file => file.transparent && file.width <= 1895 && file.height <= 631)).toBe(true);
  }, 30_000);

  it("leaves no published directory when validation fails", async () => {
    const root = await temporaryRoot();
    await expect(renderCityLogoPack({
      cityId: "032d98ea-f5da-4826-95bd-c4cf9286716e",
      cityName: "City 😀",
      slug: "bad-city",
      locale: "en",
    }, root)).rejects.toThrow(/font/i);
    expect(await readdir(root)).toEqual([]);
  });
});
