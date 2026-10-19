import {readFile} from "node:fs/promises";
import {describe,expect,it} from "vitest";

const source=await readFile(new URL("../../scripts/package-city-logo-renderer.mjs",import.meta.url),"utf8");

describe("standalone city logo renderer package",()=>{
  it("ships the active v1.3 renderer and both pinned lockup masters",()=>{
    expect(source).toContain('const version = "city-logo-inkscape-v1.3"');
    expect(source).toContain('"bitcoinwalk-horizontal.png", "bitcoinwalk-horizontal-white.png"');
    expect(source).toContain('join(stage, "public/brand", file)');
  });
});
