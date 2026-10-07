import {describe, expect, it, vi} from "vitest";
import {bech32} from "@scure/base";
import {normalizePayoutDestination, validatePayoutDestination} from "./lnurl-pay";
const endpoint = {tag: "payRequest", callback: "https://wallet.example/pay", minSendable: 1000, maxSendable: 10_000_000, metadata: JSON.stringify([["text/plain", "Pay Alice"]])};
const options = {fetchJson: vi.fn().mockResolvedValue(endpoint), resolveHost: vi.fn().mockResolvedValue("203.0.114.1")};
describe("private payout destination validation", () => {
  it("normalizes Lightning-address domains and validates LNURL-pay metadata without sending money", async () => {
    const result = await validatePayoutDestination("Alice@WALLET.Example", options);
    expect(result).toMatchObject({normalized: "Alice@wallet.example", endpoint: "https://wallet.example/.well-known/lnurlp/Alice", callback: "https://wallet.example/pay", minSendable: 1000});
    expect(options.fetchJson).toHaveBeenCalledTimes(1);
  });
  it("decodes genuine bech32 LNURLs and rejects lookalikes", () => {
    const encoded = bech32.encode("lnurl", bech32.toWords(new TextEncoder().encode("https://wallet.example/.well-known/lnurlp/alice")), 5000);
    expect(normalizePayoutDestination(encoded.toUpperCase())).toEqual({normalized: encoded, endpoint: "https://wallet.example/.well-known/lnurlp/alice"});
    for (const value of ["lnurl1notvalid", "alice @wallet.example", "alice@localhost", "alice@127.0.0.1", "https://wallet.example/pay"]) expect(() => normalizePayoutDestination(value)).toThrow();
  });
  it("blocks BitcoinWalk cycles, malformed services and unsafe ranges", async () => {
    await expect(validatePayoutDestination("city@bitcoinwalk.org", options)).rejects.toThrow("payment loop");
    await expect(validatePayoutDestination("alice@wallet.example", {...options, fetchJson: vi.fn().mockResolvedValue({...endpoint, tag: "withdrawRequest"})})).rejects.toThrow("not an LNURL-pay");
    await expect(validatePayoutDestination("alice@wallet.example", {...options, fetchJson: vi.fn().mockResolvedValue({...endpoint, minSendable: 0})})).rejects.toThrow("invalid payment range");
    await expect(validatePayoutDestination("alice@wallet.example", {...options, fetchJson: vi.fn().mockResolvedValue({...endpoint, callback: "http://127.0.0.1/pay"})})).rejects.toThrow("public HTTPS");
    await expect(validatePayoutDestination("alice@wallet.example", {...options, resolveHost: vi.fn().mockRejectedValue(new Error("private network"))})).rejects.toThrow("private network");
  });
});
