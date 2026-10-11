/** Only use the local, content-addressed image route returned by the generator. */
export function sponsorOgPreviewPath(value: unknown): string {
  const body = value as {hash?: unknown; url?: unknown} | null;
  if (!body || typeof body.hash !== "string" || !/^[a-f0-9]{64}$/.test(body.hash) || typeof body.url !== "string") throw new Error("Invalid OG image response.");
  const url = new URL(body.url);
  const path = `/api/og/files/${body.hash}.jpg`;
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== path || url.search || url.hash) throw new Error("Invalid OG image response.");
  return path;
}
