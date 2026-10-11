function parseRelayList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.startsWith("wss://"));
}

export const stagingDirectoryRelays = [
  "wss://directory-staging.bitcoinwalk.org/",
  "wss://directory-2-staging.bitcoinwalk.org/",
] as const;
export const stagingApplicationRelays = ["wss://relay-staging.bitcoinwalk.org/"] as const;
export const stagingCalendarDiscoveryRelays = [
  "wss://relay.ditto.pub/",
  "wss://relay.primal.net/",
  "wss://relay.satlantis.io/",
] as const;

function configuredOrDefault(value:string|undefined,defaults:readonly string[]):string{
  return value?.trim()?value:defaults.join(",");
}

const readRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_READ_RELAYS,stagingApplicationRelays));
const writeRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_WRITE_RELAYS,stagingApplicationRelays));
const directoryRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_DIRECTORY_RELAYS,stagingDirectoryRelays));
const calendarDiscoveryRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS,stagingCalendarDiscoveryRelays));
const zapReceiptRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_ZAP_RECEIPT_RELAYS,["wss://relay.ditto.pub/","wss://nos.lol/","wss://relay.damus.io/"]));

export const relayConfig = {
  readRelays,
  writeRelays,
  directoryRelays,
  calendarDiscoveryRelays,
  // Relay hints may include public discovery copies, but authoritative app reads
  // remain scoped to readRelays so third-party copies cannot bypass moderation.
  calendarRelayHints:[...new Set([...readRelays,...calendarDiscoveryRelays])],
  // A zap request can name at most three public receipt destinations. The
  // Rustress receipt publisher independently intersects these with its own
  // server-side allow-list.
  zapReceiptRelays:[...new Set(zapReceiptRelays)].slice(0,3),
};
