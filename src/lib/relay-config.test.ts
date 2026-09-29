import {afterEach,describe,expect,it,vi} from "vitest";

const originalDirectoryRelays=process.env.NEXT_PUBLIC_DIRECTORY_RELAYS;
const originalReadRelays=process.env.NEXT_PUBLIC_READ_RELAYS;
const originalWriteRelays=process.env.NEXT_PUBLIC_WRITE_RELAYS;
const originalCalendarDiscoveryRelays=process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS;

afterEach(()=>{
  if(originalDirectoryRelays===undefined)delete process.env.NEXT_PUBLIC_DIRECTORY_RELAYS;
  else process.env.NEXT_PUBLIC_DIRECTORY_RELAYS=originalDirectoryRelays;
  if(originalReadRelays===undefined)delete process.env.NEXT_PUBLIC_READ_RELAYS;
  else process.env.NEXT_PUBLIC_READ_RELAYS=originalReadRelays;
  if(originalWriteRelays===undefined)delete process.env.NEXT_PUBLIC_WRITE_RELAYS;
  else process.env.NEXT_PUBLIC_WRITE_RELAYS=originalWriteRelays;
  if(originalCalendarDiscoveryRelays===undefined)delete process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS;
  else process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS=originalCalendarDiscoveryRelays;
  vi.resetModules();
});

describe("directory relay configuration",()=>{
  it("uses reproducible BitcoinWalk staging application and directory transports by default",async()=>{
    delete process.env.NEXT_PUBLIC_READ_RELAYS;
    delete process.env.NEXT_PUBLIC_WRITE_RELAYS;
    delete process.env.NEXT_PUBLIC_DIRECTORY_RELAYS;
    delete process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS;
    vi.resetModules();

    const {relayConfig}=await import("./relay-config");

    expect(relayConfig.readRelays).toEqual(["wss://relay-staging.bitcoinwalk.org/"]);
    expect(relayConfig.writeRelays).toEqual(["wss://relay-staging.bitcoinwalk.org/"]);
    expect(relayConfig.directoryRelays).toEqual([
      "wss://directory-staging.bitcoinwalk.org/",
      "wss://directory-2-staging.bitcoinwalk.org/",
    ]);
    expect(relayConfig.calendarDiscoveryRelays).toEqual([
      "wss://relay.ditto.pub/",
      "wss://relay.primal.net/",
      "wss://relay.satlantis.io/",
    ]);
    expect(relayConfig.calendarRelayHints).toEqual([
      "wss://relay-staging.bitcoinwalk.org/",
      "wss://relay.ditto.pub/",
      "wss://relay.primal.net/",
      "wss://relay.satlantis.io/",
    ]);
  });

  it("requires an explicit production override instead of rewriting the staging defaults",async()=>{
    process.env.NEXT_PUBLIC_READ_RELAYS="wss://relay.bitcoinwalk.org/";
    process.env.NEXT_PUBLIC_WRITE_RELAYS="wss://relay.bitcoinwalk.org/";
    process.env.NEXT_PUBLIC_DIRECTORY_RELAYS="wss://directory.bitcoinwalk.org/,wss://directory-2.bitcoinwalk.org/";
    process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS="wss://events.example/,wss://events-2.example/";
    vi.resetModules();

    const {relayConfig}=await import("./relay-config");

    expect(relayConfig.readRelays).toEqual(["wss://relay.bitcoinwalk.org/"]);
    expect(relayConfig.writeRelays).toEqual(["wss://relay.bitcoinwalk.org/"]);
    expect(relayConfig.directoryRelays).toEqual([
      "wss://directory.bitcoinwalk.org/",
      "wss://directory-2.bitcoinwalk.org/",
    ]);
    expect(relayConfig.calendarDiscoveryRelays).toEqual(["wss://events.example/","wss://events-2.example/"]);
    expect(relayConfig.calendarRelayHints).toEqual([
      "wss://relay.bitcoinwalk.org/",
      "wss://events.example/",
      "wss://events-2.example/",
    ]);
  });

  it("does not let blank build variables erase the staging transport baseline",async()=>{
    process.env.NEXT_PUBLIC_READ_RELAYS=" ";
    process.env.NEXT_PUBLIC_WRITE_RELAYS="";
    process.env.NEXT_PUBLIC_DIRECTORY_RELAYS="   ";
    process.env.NEXT_PUBLIC_CALENDAR_DISCOVERY_RELAYS=" ";
    vi.resetModules();

    const {relayConfig}=await import("./relay-config");

    expect(relayConfig.readRelays).toEqual(["wss://relay-staging.bitcoinwalk.org/"]);
    expect(relayConfig.writeRelays).toEqual(["wss://relay-staging.bitcoinwalk.org/"]);
    expect(relayConfig.directoryRelays).toHaveLength(2);
    expect(relayConfig.calendarDiscoveryRelays).toHaveLength(3);
  });
});
