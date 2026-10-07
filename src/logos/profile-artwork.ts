import {createHash, randomUUID} from "node:crypto";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {join} from "node:path";
import sharp from "sharp";

export const profileArtworkVersion = "city-profile-v1";
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const limits = {limitInputPixels: 20_000_000, failOn: "warning" as const};
export type ProfileArtworkSource = {
  /** Resolved by a trusted caller from the latest approved city revision, never a browser assertion. */
  cityId: string;
  revisionId: string;
  /** Original approved hero, not the finished OG image. Null uses a neutral background. */
  hero: Buffer | null;
  /** Transparent bitcoinwalk-on-black city-logo variant, including the city name. */
  cityLogo: Buffer;
};
export type ProfileArtwork = {
  version: typeof profileArtworkVersion;
  sourceKey: string;
  avatar: {url: string; hash: string; width: number; height: number};
  banner: {url: string; hash: string; width: number; height: number};
};

async function raster(bytes: Buffer) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Profile artwork source exceeds 10 MB");
  const image = sharp(bytes, limits);
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) {
    throw new Error("Profile artwork requires a still PNG, JPEG or WebP");
  }
  return image;
}

/** Pure rendering: no external fetches, account creation, keys or Nostr publication. */
export async function renderProfileArtwork(hero: Buffer | null, cityLogo: Buffer) {
  const logo = await raster(cityLogo);
  if (!(await logo.metadata()).hasAlpha) throw new Error("City logo must be transparent");
  const trimmed = await logo.trim().png().toBuffer();
  const render = async (width: number, height: number, box: number) => {
    const base = hero
      ? await (await raster(hero)).rotate().resize(width, height, {fit: "cover", position: "centre"}).toBuffer()
      : await sharp({create: {width, height, channels: 3, background: "#25333a"}}).png().toBuffer();
    // The square logo box lies fully inside the avatar's circular crop (including corners).
    const mark = await sharp(trimmed).resize(box, box, {fit: "inside"}).png().toBuffer();
    const shade = Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="black" fill-opacity="0.48"/></svg>`);
    return sharp(base).composite([{input: shade}, {input: mark, gravity: "centre"}])
      .toColourspace("srgb").webp({quality: 90, effort: 5}).toBuffer();
  };
  return {avatar: await render(1024, 1024, 660), banner: await render(1500, 500, 380)};
}

export class ProfileArtworkStore {
  private pending = new Map<string, Promise<ProfileArtwork>>();
  private mediaRoot: string;
  private origin: string;
  constructor(mediaRoot: string, origin: string) {
    this.mediaRoot = mediaRoot;
    this.origin = origin;
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || url.origin !== origin) {
      throw new Error("Profile artwork requires a canonical HTTPS origin");
    }
  }
  async ensure(source: ProfileArtworkSource): Promise<ProfileArtwork> {
    if (!/^[0-9a-f-]{36}$/i.test(source.cityId) || !/^[0-9a-f]{64}$/.test(source.revisionId)) {
      throw new Error("An approved city and revision are required");
    }
    const key = digest(JSON.stringify([profileArtworkVersion, sharp.versions, source.cityId, source.revisionId,
      source.hero ? digest(source.hero) : null, digest(source.cityLogo)]));
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 2) throw new Error("Profile artwork rendering is busy; retry shortly");
    const task = this.create(source, key);
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
  private async atomic(path: string, bytes: Buffer | string) {
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, bytes, {mode: 0o600});
    await rename(temp, path);
  }
  private async create(source: ProfileArtworkSource, key: string): Promise<ProfileArtwork> {
    const manifests = join(this.mediaRoot, "profile-artwork"), files = join(this.mediaRoot, "files");
    const manifestPath = join(manifests, `${key}.json`);
    try {
      const cached: ProfileArtwork = JSON.parse(await readFile(manifestPath, "utf8"));
      if (cached.version !== profileArtworkVersion || cached.sourceKey !== key) throw new Error("Stale manifest");
      for (const [kind, width, height] of [["avatar", 1024, 1024], ["banner", 1500, 500]] as const) {
        const asset = cached[kind];
        if (!/^[0-9a-f]{64}$/.test(asset.hash) || asset.width !== width || asset.height !== height
          || asset.url !== `${this.origin}/api/media/files/${asset.hash}.webp`
          || digest(await readFile(join(files, `${asset.hash}.webp`))) !== asset.hash) throw new Error("Damaged artwork");
      }
      return cached;
    } catch { /* Missing or damaged cache is regenerated from the approved source. */ }
    const rendered = await renderProfileArtwork(source.hero, source.cityLogo);
    await mkdir(manifests, {recursive: true, mode: 0o700});
    await mkdir(files, {recursive: true, mode: 0o700});
    const store = async (bytes: Buffer, width: number, height: number) => {
      const hash = digest(bytes);
      await this.atomic(join(files, `${hash}.webp`), bytes);
      return {url: `${this.origin}/api/media/files/${hash}.webp`, hash, width, height};
    };
    const result: ProfileArtwork = {version: profileArtworkVersion, sourceKey: key,
      avatar: await store(rendered.avatar, 1024, 1024), banner: await store(rendered.banner, 1500, 500)};
    await this.atomic(manifestPath, JSON.stringify(result));
    return result;
  }
}
