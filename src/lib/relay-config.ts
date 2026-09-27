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

function configuredOrDefault(value:string|undefined,defaults:readonly string[]):string{
  return value?.trim()?value:defaults.join(",");
}

export const relayConfig = {
  readRelays: parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_READ_RELAYS,stagingApplicationRelays)),
  writeRelays: parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_WRITE_RELAYS,stagingApplicationRelays)),
  directoryRelays: parseRelayList(configuredOrDefault(process.env.NEXT_PUBLIC_DIRECTORY_RELAYS,stagingDirectoryRelays)),
};
