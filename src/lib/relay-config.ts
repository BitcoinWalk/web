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

export const relayConfig = {
  readRelays: parseRelayList(process.env.NEXT_PUBLIC_READ_RELAYS),
  writeRelays: parseRelayList(process.env.NEXT_PUBLIC_WRITE_RELAYS),
  directoryRelays: parseRelayList(process.env.NEXT_PUBLIC_DIRECTORY_RELAYS ?? stagingDirectoryRelays.join(",")),
};
