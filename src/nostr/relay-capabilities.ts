export function supportsOccurrenceCancellationRelayVersion(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^bitcoinwalk-organizers-(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 0 && (minor > 6 || (minor === 6 && patch >= 1));
}

export async function requireOccurrenceCancellationRelay(relays: string[]): Promise<void> {
  for (const relay of relays) {
    const endpoint = new URL(relay);
    endpoint.protocol = endpoint.protocol === "ws:" ? "http:" : "https:";
    const response = await fetch(endpoint, {
      headers: { Accept: "application/nostr+json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const info = response.ok ? await response.json() : null;
    if (!response.ok || !supportsOccurrenceCancellationRelayVersion(info?.version)) {
      throw new Error("Organizer cancellation is not enabled on this relay. Nothing signed or cancelled.");
    }
  }
}
