import {describe, expect, it, vi} from "vitest";
import {bech32} from "@scure/base";
import {createHash} from "node:crypto";
import {encode,sign} from "bolt11";
import {normalizePayoutDestination, validatePayoutDestination} from "./lnurl-pay";
const endpoint = {tag: "payRequest", callback: "https://wallet.example/pay", minSendable: 1000, maxSendable: 10_000_000, metadata: JSON.stringify([["text/plain", "Pay Alice"]])};
function invoice(metadata=endpoint.metadata,amount="1000"){
 const hash="ab".repeat(32),commit=createHash("sha256").update(metadata).digest("hex");
 return {pr:sign(encode({millisatoshis:amount,timestamp:Math.floor(Date.now()/1000),tags:[{tagName:"payment_hash",data:hash},{tagName:"purpose_commit_hash",data:commit},{tagName:"expire_time",data:3600}]}),"34".repeat(32)).paymentRequest!};
}
function options(){return {fetchJson:vi.fn().mockResolvedValueOnce(endpoint).mockResolvedValueOnce(invoice()),resolveHost:vi.fn().mockResolvedValue("203.0.114.1")};}
describe("private payout destination validation", () => {
  it("normalizes Lightning-address domains and validates LNURL-pay metadata without sending money", async () => {
    const transport=options(),result = await validatePayoutDestination("Alice@WALLET.Example", transport);
    expect(result).toMatchObject({normalized: "Alice@wallet.example", endpoint: "https://wallet.example/.well-known/lnurlp/Alice", callback: "https://wallet.example/pay", minSendable: 1000});
    expect(result.probe).toEqual({amountMsat:1000,payment:"verified",nip57:"not-advertised"});
    expect(transport.fetchJson).toHaveBeenCalledTimes(2);expect(String(transport.fetchJson.mock.calls[1][0])).toBe("https://wallet.example/pay?amount=1000");
  });
  it("decodes genuine bech32 LNURLs and rejects lookalikes", () => {
    const encoded = bech32.encode("lnurl", bech32.toWords(new TextEncoder().encode("https://wallet.example/.well-known/lnurlp/alice")), 5000);
    expect(normalizePayoutDestination(encoded.toUpperCase())).toEqual({normalized: encoded, endpoint: "https://wallet.example/.well-known/lnurlp/alice"});
    for (const value of ["lnurl1notvalid", "alice @wallet.example", "alice@localhost", "alice@127.0.0.1", "https://wallet.example/pay"]) expect(() => normalizePayoutDestination(value)).toThrow();
  });
  it("blocks BitcoinWalk cycles, malformed services and unsafe ranges", async () => {
    await expect(validatePayoutDestination("city@bitcoinwalk.org", options())).rejects.toThrow("payment loop");
    await expect(validatePayoutDestination("alice@wallet.example", {...options(), fetchJson: vi.fn().mockResolvedValue({...endpoint, tag: "withdrawRequest"})})).rejects.toThrow("not an LNURL-pay");
    await expect(validatePayoutDestination("alice@wallet.example", {...options(), fetchJson: vi.fn().mockResolvedValue({...endpoint, minSendable: 0})})).rejects.toThrow("invalid payment range");
    await expect(validatePayoutDestination("alice@wallet.example", {...options(), fetchJson: vi.fn().mockResolvedValue({...endpoint, callback: "http://127.0.0.1/pay"})})).rejects.toThrow("public HTTPS");
    await expect(validatePayoutDestination("alice@wallet.example", {...options(), resolveHost: vi.fn().mockRejectedValue(new Error("private network"))})).rejects.toThrow("private network");
  });
  it("rejects a provider whose invoice does not commit to its advertised metadata",async()=>{
    const transport=options();transport.fetchJson.mockReset().mockResolvedValueOnce(endpoint).mockResolvedValueOnce(invoice("different metadata"));
    await expect(validatePayoutDestination("alice@wallet.example",transport)).rejects.toThrow("unverifiable payout invoice");
  });
  it("verifies an advertised NIP-57 zap invoice without paying it",async()=>{
    const provider="cd".repeat(32),advertised={...endpoint,allowsNostr:true,nostrPubkey:provider},fetchJson=vi.fn().mockImplementation(async(url:URL)=>{
      if(url.pathname.includes(".well-known"))return advertised;
      const raw=url.searchParams.get("nostr");return raw?invoice(raw):invoice();
    });
    await expect(validatePayoutDestination("alice@wallet.example",{fetchJson,resolveHost:vi.fn().mockResolvedValue("203.0.114.1")})).resolves.toMatchObject({probe:{payment:"verified",nip57:"verified"}});
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });
  it("keeps an ordinary payout address valid when advertised NIP-57 support is broken",async()=>{
    const advertised={...endpoint,allowsNostr:true,nostrPubkey:"cd".repeat(32)},fetchJson=vi.fn().mockResolvedValueOnce(advertised).mockResolvedValueOnce(invoice()).mockResolvedValueOnce({status:"ERROR"});
    await expect(validatePayoutDestination("alice@wallet.example",{fetchJson,resolveHost:vi.fn().mockResolvedValue("203.0.114.1")})).resolves.toMatchObject({probe:{payment:"verified",nip57:"unverified"}});
  });
});
