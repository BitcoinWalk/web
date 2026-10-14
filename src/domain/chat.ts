export type ChatDestination = { relay: string; groupId: string };
export type ChatConfig = {
  environment: "staging" | "production";
  global: ChatDestination | null;
  paidCities: Record<string, { slug: string; tier?: "basic"|"pro"; destination: ChatDestination | null; walkieTalkieEnabled?: boolean; armadaEnabled?: boolean }>;
};

export const PRODUCTION_GLOBAL_COMMUNITY_URL = "https://bitcoinwalk.org/join";

export function armadaChatUrl(destination: ChatDestination): string | null {
  try {
    const relay = new URL(destination.relay);
    if (relay.protocol !== "wss:" || relay.username || relay.password || relay.port ||
        relay.pathname !== "/" || relay.search || relay.hash ||
        !/^[a-z0-9-]+\.bitcoinwalk\.org$/.test(relay.hostname) ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(destination.groupId)) return null;
    return `https://armada.buzz/s/${relay.hostname}/${encodeURIComponent(destination.groupId)}`;
  } catch {
    return null;
  }
}

/** Only operator configuration determines tier/routing, never organizer-supplied chatUrl. */
export function resolveCityChat(cityId: string | undefined, slug: string, config: ChatConfig, paidEntitled?: boolean) {
  const configured = cityId && Object.hasOwn(config.paidCities, cityId) ? config.paidCities[cityId] : undefined;
  const configuredBasic=configured?.tier==="basic",paid = paidEntitled === false&&!configuredBasic ? undefined : configured;
  const paidScope = configuredBasic||paidEntitled === true || !!paid;
  let destination = config.global;
  if (paidScope) {
    const relay=paid?.destination?.relay,canonical=configuredBasic?"wss://chat.bitcoinwalk.org":`wss://${slug}.bitcoinwalk.org`;
    const retainedStagingPilot=config.environment==="staging"&&slug.endsWith("-staging")&&relay===`wss://chat-${slug}.bitcoinwalk.org`;
    destination = paid?.slug === slug && (relay === canonical || relay === `${canonical}/` || retainedStagingPilot)
      ? paid.destination : null;
  }
  const directUrl = destination ? armadaChatUrl(destination) : null;
  const walkieTalkieEnabled=paidScope?(paid?.walkieTalkieEnabled??!!destination):!!destination;
  const armadaEnabled=paidScope?(paid?.armadaEnabled??!!directUrl):!!directUrl;
  return {
    scope: paidScope ? "city" as const : "global" as const,
    environment: config.environment,
    walkieTalkieEnabled,
    armadaEnabled,
    nip29: walkieTalkieEnabled && directUrl ? destination : null,
    url: armadaEnabled?(!paidScope && config.environment === "production" && directUrl
      ? PRODUCTION_GLOBAL_COMMUNITY_URL
      : directUrl):null,
  };
}
