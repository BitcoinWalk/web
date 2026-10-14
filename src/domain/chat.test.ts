import { describe, expect, it } from "vitest";
import { armadaChatUrl, resolveCityChat, type ChatConfig } from "./chat";

const config: ChatConfig = {
  environment: "staging",
  global: { relay: "wss://chat-staging.bitcoinwalk.org", groupId: "global-test" },
  paidCities: {
    paid: { slug: "austin", destination: { relay: "wss://austin.bitcoinwalk.org", groupId: "city-test" } },
    pending: { slug: "radom", destination: null },
  },
};
const productionConfig: ChatConfig = { ...config, environment: "production" };

describe("operator-controlled chat routing", () => {
  it("routes free and legacy cities to the global channel", () => {
    expect(resolveCityChat("free", "radom", config).url).toBe("https://armada.buzz/s/chat-staging.bitcoinwalk.org/global-test");
    expect(resolveCityChat(undefined, "austin", config).scope).toBe("global");
  });
  it("uses the canonical BitcoinWalk join alias for production global chat", () => {
    expect(resolveCityChat("free", "radom", productionConfig).url).toBe("https://bitcoinwalk.org/join");
  });
  it("routes a provisioned Basic city to its own group on the shared relay",()=>{
    const basic={...config,paidCities:{basic:{slug:"seattle",tier:"basic" as const,destination:{relay:"wss://chat.bitcoinwalk.org/",groupId:"bitcoinwalk-seattle"},walkieTalkieEnabled:true,armadaEnabled:false}}};
    expect(resolveCityChat("basic","seattle",basic,false)).toEqual({scope:"city",environment:"staging",walkieTalkieEnabled:true,armadaEnabled:false,nip29:{relay:"wss://chat.bitcoinwalk.org/",groupId:"bitcoinwalk-seattle"},url:null});
  });
  it("routes a provisioned paid city to its dedicated relay and group", () => {
    expect(resolveCityChat("paid", "austin", config)).toEqual({ scope: "city", environment: "staging", walkieTalkieEnabled:true,armadaEnabled:true,nip29:{relay:"wss://austin.bitcoinwalk.org",groupId:"city-test"},url: "https://armada.buzz/s/austin.bitcoinwalk.org/city-test" });
    expect(resolveCityChat("paid", "austin", {...config,paidCities:{paid:{slug:"austin",destination:{relay:"wss://austin.bitcoinwalk.org/",groupId:"city-test"}}}}).url).toBe("https://armada.buzz/s/austin.bitcoinwalk.org/city-test");
  });
  it("does not fabricate a link or fall back to global for pending paid cities", () => {
    expect(resolveCityChat("pending", "radom", config)).toMatchObject({ scope: "city", walkieTalkieEnabled:false,armadaEnabled:false,url: null });
    expect(resolveCityChat("missing", "radom", config, true)).toMatchObject({ scope: "city", walkieTalkieEnabled:false,armadaEnabled:false,url: null });
  });
  it("uses global chat when an unentitled city happens to match paid configuration", () => {
    expect(resolveCityChat("paid", "austin", config, false)).toMatchObject({ scope: "global", url: "https://armada.buzz/s/chat-staging.bitcoinwalk.org/global-test" });
  });
  it("controls Walkie Talkie and Armada independently",()=>{
    const split={...config,paidCities:{paid:{...config.paidCities.paid,walkieTalkieEnabled:true,armadaEnabled:false}}};
    expect(resolveCityChat("paid","austin",split)).toMatchObject({walkieTalkieEnabled:true,armadaEnabled:false,nip29:{relay:"wss://austin.bitcoinwalk.org",groupId:"city-test"},url:null});
    split.paidCities.paid.walkieTalkieEnabled=false;split.paidCities.paid.armadaEnabled=true;
    expect(resolveCityChat("paid","austin",split)).toMatchObject({walkieTalkieEnabled:false,armadaEnabled:true,nip29:null,url:"https://armada.buzz/s/austin.bitcoinwalk.org/city-test"});
  });
  it("does not reuse a city's destination for a different slug", () => {
    expect(resolveCityChat("paid", "london", config).url).toBeNull();
  });
  it("handles missing global provisioning", () => {
    expect(resolveCityChat(undefined, "radom", { ...config, global: null }).url).toBeNull();
  });
  it("does not treat prototype properties as paid city records", () => {
    expect(resolveCityChat("constructor", "radom", config).scope).toBe("global");
  });
  it.each([
    "javascript:alert(1)", "ws://austin.bitcoinwalk.org", "wss://evil.example",
    "wss://austin.bitcoinwalk.org.evil.example", "wss://user@austin.bitcoinwalk.org",
    "wss://austin.bitcoinwalk.org/path", "wss://austin.bitcoinwalk.org?x=1",
    "wss://austin.bitcoinwalk.org#x", "wss://austin.bitcoinwalk.org:444",
  ])("rejects invalid destinations: %s", (relay) => {
    expect(armadaChatUrl({ relay, groupId: "chat" })).toBeNull();
  });
  it.each(["", "../chat", "chat?invite=x", "a/b", "#chat"])("rejects unsafe group IDs: %s", (groupId) => {
    expect(armadaChatUrl({ relay: "wss://austin.bitcoinwalk.org", groupId })).toBeNull();
  });
});
