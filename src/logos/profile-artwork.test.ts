import {afterEach, describe, expect, it} from "vitest";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {ProfileArtworkStore, renderProfileArtwork} from "./profile-artwork";

const cityLogo = () => readFile("design/city-logo-templates/v1/examples/prototype-packs/warszawa/warszawa-bitcoinwalk-on-black.png");
let directory: string | undefined;
afterEach(async () => { if (directory) await rm(directory, {recursive: true, force: true}); directory = undefined; });
describe("city profile artwork", () => {
  it("renders deterministic square and wide images without private metadata", async () => {
    const a = await renderProfileArtwork(null, await cityLogo());
    const b = await renderProfileArtwork(null, await cityLogo());
    expect(a).toEqual(b);
    expect(await sharp(a.avatar).metadata()).toMatchObject({width: 1024, height: 1024, format: "webp"});
    expect(await sharp(a.banner).metadata()).toMatchObject({width: 1500, height: 500, format: "webp"});
    expect((await sharp(a.avatar).metadata()).exif).toBeUndefined();
    // No bright logo/name pixels are lost when a client masks the avatar to a circle.
    const {data, info} = await sharp(a.avatar).removeAlpha().raw().toBuffer({resolveWithObject: true});
    let bright = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 3] > 200) {
        bright++;
        expect((x - 512) ** 2 + (y - 512) ** 2).toBeLessThan(480 ** 2);
      }
    }
    expect(bright).toBeGreaterThan(10_000);
  });
  it("keeps the original hero visible and never silently substitutes a corrupt supplied source", async () => {
    const hero = await sharp({create: {width: 500, height: 500, channels: 3, background: "#ff0000"}}).png().toBuffer();
    const a = await renderProfileArtwork(hero, await cityLogo());
    const pixel = await sharp(a.avatar).extract({left: 0, top: 0, width: 1, height: 1}).removeAlpha().raw().toBuffer();
    expect(pixel[0]).toBeGreaterThan(100);
    expect(pixel[1]).toBeLessThan(10);
    await expect(renderProfileArtwork(Buffer.from("broken"), await cityLogo())).rejects.toThrow();
    await expect(renderProfileArtwork(null, Buffer.from('<svg width="10" height="10"/>'))).rejects.toThrow();
  });
  it("coalesces, persists, repairs corrupt assets and versions approved revisions", async () => {
    directory = await mkdtemp(join(tmpdir(), "bw-profile-test-"));
    const store = new ProfileArtworkStore(directory, "https://bitcoinwalk.org");
    const source = {cityId: "c0db0e98-1011-4e1c-baaa-abe943e02381", revisionId: "a".repeat(64), hero: null, cityLogo: await cityLogo()};
    const [a, b] = await Promise.all([store.ensure(source), store.ensure(source)]);
    expect(a).toEqual(b);
    expect(await store.ensure(source)).toEqual(a);
    const path = join(directory, "files", `${a.avatar.hash}.webp`);
    await writeFile(path, "corrupt");
    expect(await store.ensure(source)).toEqual(a);
    expect(await sharp(await readFile(path)).metadata()).toMatchObject({width: 1024});
    const updated = await store.ensure({...source, revisionId: "b".repeat(64)});
    expect(updated.sourceKey).not.toBe(a.sourceKey);
    expect(updated.avatar).toEqual(a.avatar); // identical artwork can safely share immutable bytes
    const changed = await store.ensure({...source, cityLogo: await readFile("design/city-logo-templates/v1/examples/prototype-packs/radom/radom-bitcoinwalk-on-black.png")});
    expect(changed.avatar.hash).not.toBe(a.avatar.hash);
    expect(a.avatar.url).toMatch(/^https:\/\/bitcoinwalk.org\/api\/media\/files\/[a-f0-9]{64}\.webp$/);
    await expect(store.ensure({...source, cityId: "../bad"})).rejects.toThrow();
  });
  it("rejects noncanonical or insecure public origins", () => {
    for (const origin of ["http://bitcoinwalk.org", "https://user:pass@bitcoinwalk.org", "https://bitcoinwalk.org/path"]) {
      expect(() => new ProfileArtworkStore("/tmp/unused", origin)).toThrow();
    }
  });
});
