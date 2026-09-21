function parseRelayList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.startsWith("wss://"));
}

export const relayConfig = {
  readRelays: parseRelayList(process.env.NEXT_PUBLIC_READ_RELAYS),
  writeRelays: parseRelayList(process.env.NEXT_PUBLIC_WRITE_RELAYS),
};
