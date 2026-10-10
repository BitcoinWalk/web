import {afterEach,describe,expect,it,vi} from "vitest";
import {relayConfig} from "./relay-config";
import {serverDirectoryReadRelay,serverReadRelays} from "./server-relay-config";

afterEach(()=>vi.unstubAllEnvs());

describe("serverReadRelays",()=>{
  it("uses public read relays when no private listener is configured",()=>{
    vi.stubEnv("BITCOINWALK_SERVER_READ_RELAY",undefined);
    expect(serverReadRelays()).toEqual(relayConfig.readRelays);
  });
  it("uses only the private listener for server-side reads",()=>{
    vi.stubEnv("BITCOINWALK_SERVER_READ_RELAY","ws://127.0.0.1:3334");
    expect(serverReadRelays()).toEqual(["ws://127.0.0.1:3334/"]);
    expect(relayConfig.readRelays).not.toContain("ws://127.0.0.1:3334/");
  });
  it.each(["wss://relay-staging.bitcoinwalk.org","ws://example.org:3334","ws://127.0.0.1:3334/private","ws://127.0.0.1:3334/?x=1","ws://127.0.0.1"])("rejects an unsafe internal endpoint: %s",value=>{
    vi.stubEnv("BITCOINWALK_SERVER_READ_RELAY",value);
    expect(()=>serverReadRelays()).toThrow("loopback");
  });
});

describe("serverDirectoryReadRelay",()=>{
  it("maps only the public primary transport to the reviewed loopback listener",()=>{
    vi.stubEnv("BITCOINWALK_SERVER_DIRECTORY_READ_RELAY","ws://127.0.0.1:3343/");
    expect(serverDirectoryReadRelay(relayConfig.directoryRelays[0])).toBe("ws://127.0.0.1:3343/");
    expect(serverDirectoryReadRelay(relayConfig.directoryRelays[1])).toBe(relayConfig.directoryRelays[1]);
  });
  it("leaves public transports unchanged when no private listener is configured",()=>{
    vi.stubEnv("BITCOINWALK_SERVER_DIRECTORY_READ_RELAY",undefined);
    expect(serverDirectoryReadRelay(relayConfig.directoryRelays[0])).toBe(relayConfig.directoryRelays[0]);
  });
  it.each(["ws://127.0.0.1:3344/","ws://localhost:3343/","wss://directory-staging.bitcoinwalk.org/"])("rejects an unreviewed private directory endpoint: %s",value=>{
    vi.stubEnv("BITCOINWALK_SERVER_DIRECTORY_READ_RELAY",value);
    expect(()=>serverDirectoryReadRelay(relayConfig.directoryRelays[0])).toThrow("reviewed primary");
  });
});
