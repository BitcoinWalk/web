function parseRelayList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.startsWith("wss://"));
}

const productionBuild=process.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE==="production";
const stagingDirectoryRelays:readonly string[] = productionBuild?[]:[
  "wss://directory-staging.bitcoinwalk.org/",
  "wss://directory-2-staging.bitcoinwalk.org/",
];
const stagingApplicationRelays:readonly string[] = productionBuild?[]:["wss://relay-staging.bitcoinwalk.org/"];
const stagingCalendarDiscoveryRelays = [
  "wss://relay.ditto.pub/",
  "wss://relay.primal.net/",
  "wss://relay.satlantis.io/",
] as const;
// This public launch policy was reviewed and activated in production on
// 25 October 2026. Pin it in source for production builds so a later release
// cannot silently disable announcements by omitting build-time variables.
const productionAnnouncementRelays = [
  "wss://relay.damus.io/",
  "wss://relay.primal.net/",
] as const;
const productionAnnouncementNotBefore = 1792886400;

function configuredOrDefault(value:string|undefined,defaults:readonly string[]):string{
  return value?.trim()?value:defaults.join(",");
}

const readRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_READ_RELAYS,stagingApplicationRelays));
const writeRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_WRITE_RELAYS,stagingApplicationRelays));
const directoryRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_DIRECTORY_RELAYS,stagingDirectoryRelays));
const calendarDiscoveryRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS,stagingCalendarDiscoveryRelays));
// Intentionally no default in staging: it remains fail closed unless explicitly
// configured. Production uses only the reviewed source-pinned policy;
// environment drift cannot replace it.
const announcementRelays=productionBuild
  ? [...productionAnnouncementRelays]
  : parseRelayList(process.env.NEXT_PUBLIC_ANNOUNCEMENT_RELAYS);
const announcementNotBefore=productionBuild
  ? productionAnnouncementNotBefore
  : /^\d{10}$/.test(process.env.NEXT_PUBLIC_ANNOUNCEMENT_NOT_BEFORE??"")
    ? Number(process.env.NEXT_PUBLIC_ANNOUNCEMENT_NOT_BEFORE)
    : 0;
const zapReceiptRelays=parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_ZAP_RECEIPT_RELAYS,["wss://relay.ditto.pub/","wss://nos.lol/","wss://relay.damus.io/"]));

export const relayConfig = {
  readRelays,
  writeRelays,
  directoryRelays,
  calendarDiscoveryRelays,
  announcementRelays,
  announcementNotBefore,
  // Relay hints may include public discovery copies, but authoritative app reads
  // remain scoped to readRelays so third-party copies cannot bypass moderation.
  calendarRelayHints:[...new Set([...readRelays,...calendarDiscoveryRelays])],
  // A zap request can name at most three public receipt destinations. The
  // Rustress receipt publisher independently intersects these with its own
  // server-side allow-list.
  zapReceiptRelays:[...new Set(zapReceiptRelays)].slice(0,3),
};
