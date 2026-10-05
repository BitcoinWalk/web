import {describe, expect, it} from "vitest";
import sharp from "sharp";
import {normalizeSponsorLogo, validateSponsorSvg, MAX_SPONSOR_LOGO_BYTES} from "./sponsor-logo";
const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">${body}</svg>`);
describe("sponsor logo normalization", () => {
  it.each(["png", "webp"] as const)("normalizes uploaded %s into a bounded PNG", async format => {
    const input = await sharp({create:{width:1400,height:700,channels:4,background:"#fff"}}).toFormat(format).toBuffer();
    const result = await normalizeSponsorLogo(input, `image/${format}`);
    expect(await sharp(result.body).metadata()).toMatchObject({format:"png",width:1024,height:512});
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rasterizes outlined SVG with transparency", async () => {
    const result = await normalizeSponsorLogo(svg('<path fill="#fff" d="M10 10H100V50H10Z"/>'), "image/svg+xml");
    expect(await sharp(result.body).metadata()).toMatchObject({format:"png",hasAlpha:true});
  });
  it("rejects JPEG even when disguised as PNG", async () => {
    const input = await sharp({create:{width:64,height:64,channels:3,background:"white"}}).jpeg().toBuffer();
    await expect(normalizeSponsorLogo(input,"image/jpeg")).rejects.toThrow("JPEG");
    await expect(normalizeSponsorLogo(input,"image/png")).rejects.toThrow("match");
  });
  it("rejects oversized uploads before decoding", async () => {
    await expect(normalizeSponsorLogo(Buffer.alloc(MAX_SPONSOR_LOGO_BYTES+1),"image/png")).rejects.toThrow("5 MB");
  });
  it.each([
    '<script>alert(1)</script>', '<image href="http://127.0.0.1/secret"/>',
    '<path onload="alert(1)"/>', '<style>@import "https://evil.example";</style>',
    '<foreignObject/>', '<text>Needs outlining</text>', '<use href="#a"/>',
    '<path fill="url(https://evil.example)"/>', '<g xmlns="http://evil.example"/>',
  ])("rejects unsafe or unsupported SVG: %s", body => expect(() => validateSponsorSvg(svg(body))).toThrow());
  it("rejects entity declarations and broken XML", () => {
    expect(() => validateSponsorSvg(Buffer.from('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+svg("")))).toThrow();
    expect(() => validateSponsorSvg(svg("<g>"))).toThrow();
  });
  it("bounds nesting", () => expect(() => validateSponsorSvg(svg("<g>".repeat(30)+"</g>".repeat(30)))).toThrow("complex"));
});
