/** Only use the local, content-addressed image route returned by the generator. */
export function sponsorOgPreviewPath(value: unknown): string {
  const body = value as {hash?: unknown; url?: unknown} | null;
  if (!body || typeof body.hash !== "string" || !/^[a-f0-9]{64}$/.test(body.hash) || typeof body.url !== "string") throw new Error("Invalid OG image response.");
  const url = new URL(body.url);
  const path = `/api/og/files/${body.hash}.jpg`;
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== path || url.search || url.hash) throw new Error("Invalid OG image response.");
  return path;
}

export function exactApprovedSponsorAsset(value: unknown, expectedHash: string): string {
  const hash=(value as {hash?:unknown}|null)?.hash;
  if(typeof hash!=="string"||hash!==expectedHash||!/^[a-f0-9]{64}$/.test(hash))throw new Error("Uploaded logo changed. Refresh and review the current artwork before activating it.");
  return hash;
}
