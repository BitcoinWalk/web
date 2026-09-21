import {afterEach,describe,expect,it,vi} from "vitest";
import {relayConfig} from "./relay-config";
import {serverReadRelays} from "./server-relay-config";

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
