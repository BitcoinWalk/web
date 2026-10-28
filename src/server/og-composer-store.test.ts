import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import {
  listSavedOg,
  readOwnedOgSource,
  readSavedOg,
  renderAndSaveOg,
  storeOgSource,
} from "./og-composer-store";

let root: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});
describe("super-admin OG image storage", () => {
  it("normalizes private sources and reproduces a saved 1200 × 630 render from its manifest", async () => {
    root = await mkdtemp(join(tmpdir(), "bw-og-"));
    vi.stubEnv("BITCOINWALK_MEDIA_ROOT", root);
    const actor = "a".repeat(64),
      background = await storeOgSource(
        await sharp({
          create: {
            width: 1600,
            height: 900,
            channels: 3,
            background: "#334455",
          },
        })
          .jpeg()
          .toBuffer(),
        { source: "upload" },
        actor,
      ),
      partnerLogo = await storeOgSource(
        await sharp({
          create: {
            width: 100,
            height: 50,
            channels: 4,
            background: "#f7931a",
          },
        })
          .png()
          .toBuffer(),
        { source: "upload" },
        actor,
      ),
      composition = {
        version: 1 as const,
        title: "Launch card",
        background: {
          hash: background.hash,
          source: "upload" as const,
          zoom: 1,
          x: 50,
          y: 50,
        },
        mark: {
          visible: true,
          variant: "horizontal" as const,
          x: 40,
          y: 40,
          width: 320,
        },
        text: {
          value: "Powered by BitcoinWalk",
          x: 40,
          y: 450,
          width: 700,
          fontSize: 52,
          align: "left" as const,
          color: "#ffffff" as const,
          treatment: "shadow" as const,
        },
        logo: {
          hash: partnerLogo.hash,
          source: "upload" as const,
          label: "Small source enlarged safely",
          x: 700,
          y: 100,
          width: 400,
        },
      },
      saved = await renderAndSaveOg(actor, composition);
    expect(
      await sharp(
        Buffer.from(saved.dataUrl.split(",")[1], "base64"),
      ).metadata(),
    ).toMatchObject({ format: "png", width: 1200, height: 630 });
    expect(await listSavedOg(actor)).toMatchObject([
      { id: saved.id, title: "Launch card", composition },
    ]);
    expect(await readSavedOg(actor, saved.id)).toMatchObject({
      outputHash: saved.outputHash,
      composition,
    });
    expect(await readOwnedOgSource(actor, background.hash)).toMatchObject({
      hash: background.hash,
      source: "upload",
    });
    expect(await readOwnedOgSource("b".repeat(64), background.hash)).toBeNull();
    expect(
      JSON.parse(
        await readFile(
          join(root, "og-composer", "renders", saved.id + ".json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ actor, outputHash: saved.outputHash });
  });
  it("fails closed when a layer would leave the canvas", async () => {
    root = await mkdtemp(join(tmpdir(), "bw-og-clip-"));
    vi.stubEnv("BITCOINWALK_MEDIA_ROOT", root);
    const actor = "a".repeat(64),
      background = await storeOgSource(
        await sharp({
          create: {
            width: 1200,
            height: 630,
            channels: 3,
            background: "white",
          },
        })
          .png()
          .toBuffer(),
        { source: "upload" },
        actor,
      ),
      composition = {
        version: 1 as const,
        title: "Bad card",
        background: {
          hash: background.hash,
          source: "upload" as const,
          zoom: 1,
          x: 50,
          y: 50,
        },
        mark: {
          visible: true,
          variant: "traditional" as const,
          x: 1150,
          y: 40,
          width: 120,
        },
        text: {
          value: "Text",
          x: 40,
          y: 450,
          width: 700,
          fontSize: 52,
          align: "left" as const,
          color: "#ffffff" as const,
          treatment: "shadow" as const,
        },
        logo: null,
      };
    await expect(
      renderAndSaveOg(actor, composition),
    ).rejects.toThrow("inside");
    expect(await listSavedOg(actor)).toEqual([]);
  });
});
