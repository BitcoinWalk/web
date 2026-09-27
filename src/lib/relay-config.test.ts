import {afterEach,describe,expect,it,vi} from "vitest";

const originalDirectoryRelays=process.env.NEXT_PUBLIC_DIRECTORY_RELAYS;

afterEach(()=>{
  if(originalDirectoryRelays===undefined)delete process.env.NEXT_PUBLIC_DIRECTORY_RELAYS;
  else process.env.NEXT_PUBLIC_DIRECTORY_RELAYS=originalDirectoryRelays;
  vi.resetModules();
});

describe("directory relay configuration",()=>{
  it("uses the two independently hosted BitcoinWalk staging transports by default",async()=>{
    delete process.env.NEXT_PUBLIC_DIRECTORY_RELAYS;
    vi.resetModules();

    const {relayConfig}=await import("./relay-config");

    expect(relayConfig.directoryRelays).toEqual([
      "wss://directory-staging.bitcoinwalk.org/",
      "wss://directory-2-staging.bitcoinwalk.org/",
    ]);
  });

  it("requires an explicit production override instead of rewriting the staging defaults",async()=>{
    process.env.NEXT_PUBLIC_DIRECTORY_RELAYS="wss://directory.bitcoinwalk.org/,wss://directory-2.bitcoinwalk.org/";
    vi.resetModules();

    const {relayConfig}=await import("./relay-config");

    expect(relayConfig.directoryRelays).toEqual([
      "wss://directory.bitcoinwalk.org/",
      "wss://directory-2.bitcoinwalk.org/",
    ]);
  });
});
