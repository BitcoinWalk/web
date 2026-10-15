import {finalizeEvent,getPublicKey,nip57} from "nostr-tools";
import {describe,expect,it,vi} from "vitest";
import {createPublicZapInvoice,publicZapInvoiceTransport} from "./public-zap-invoice";

const payerKey=new Uint8Array(32).fill(7),recipient=getPublicKey(new Uint8Array(32).fill(8)),provider=getPublicKey(new Uint8Array(32).fill(9));
function input(amountMsat=100_000){const request=finalizeEvent(nip57.makeZapRequest({pubkey:recipient,amount:amountMsat,comment:"Thanks",relays:["wss://relay.ditto.pub/"]}),payerKey);return {address:"madeira@bitcoinwalk.org",amountMsat,zapRequest:JSON.stringify(request)};}
function metadata(callback="https://bitcoinwalk.org/lnurlp/madeira/callback"){return {tag:"payRequest",callback,minSendable:1000,maxSendable:1_000_000_000,allowsNostr:true,nostrPubkey:provider};}

describe("public zap invoice boundary",()=>{
 it("dispatches only canonical BitcoinWalk LNURL reads to the capability-gated gateway",async()=>{
  const handler=vi.fn(async()=>Response.json(metadata())),transport=publicZapInvoiceTransport(handler);
  await expect(transport("https://bitcoinwalk.org/.well-known/lnurlp/madeira",{method:"GET"})).resolves.toMatchObject({status:200});
  expect(handler).toHaveBeenCalledWith("madeira","/.well-known/lnurlp/madeira","");
  await expect(transport("https://example.org/.well-known/lnurlp/madeira",{method:"GET"})).rejects.toThrow("invalid");
  await expect(transport("https://bitcoinwalk.org/api/payments",{method:"GET"})).rejects.toThrow("invalid");
 });
 it("loads trusted metadata and forwards the exact signed zap request server-side",async()=>{
  const signed=input();
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(metadata())).mockResolvedValueOnce(Response.json({pr:"lnbc1fixture"}));
  await expect(createPublicZapInvoice(signed,fetcher)).resolves.toEqual({invoice:"lnbc1fixture",provider});
  expect(fetcher).toHaveBeenCalledTimes(2);expect(String(fetcher.mock.calls[0][0])).toBe("https://bitcoinwalk.org/.well-known/lnurlp/madeira");
  const callback=new URL(String(fetcher.mock.calls[1][0]));expect(callback.origin+callback.pathname).toBe("https://bitcoinwalk.org/lnurlp/madeira/callback");expect(callback.searchParams.get("amount")).toBe("100000");expect(callback.searchParams.get("nostr")).toBe(signed.zapRequest);
 });
 it("retries the same signed callback across a short payout reconnect without changing the request",async()=>{
  const signed=input(),wait=vi.fn(async()=>{}),fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(metadata()));
  for(let attempt=0;attempt<5;attempt++)fetcher.mockResolvedValueOnce(Response.json({status:"ERROR",reason:"Payment service unavailable"},{status:503}));
  fetcher.mockResolvedValueOnce(Response.json({pr:"lnbc1recovered"}));
  await expect(createPublicZapInvoice(signed,fetcher,wait)).resolves.toEqual({invoice:"lnbc1recovered",provider});
  expect(wait).toHaveBeenCalledTimes(5);expect(fetcher).toHaveBeenCalledTimes(7);
  const callbacks=fetcher.mock.calls.slice(1).map(call=>String(call[0]));expect(new Set(callbacks).size).toBe(1);
  expect(new URL(callbacks[0]).searchParams.get("nostr")).toBe(signed.zapRequest);
 });
 it("rejects callback substitution and signed amount mismatch",async()=>{
  const evil=vi.fn<typeof fetch>().mockResolvedValue(Response.json(metadata("https://bitcoinwalk.org/lnurlp/other/callback")));
  await expect(createPublicZapInvoice(input(),evil)).rejects.toThrow("callback is invalid");
  const changed=input();changed.amountMsat=101_000;await expect(createPublicZapInvoice(changed,vi.fn<typeof fetch>())).rejects.toThrow("does not match");
 });
 it("rejects non-BitcoinWalk addresses before making a request",async()=>{const fetcher=vi.fn<typeof fetch>();await expect(createPublicZapInvoice({...input(),address:"madeira@example.org"},fetcher)).rejects.toThrow("unavailable");expect(fetcher).not.toHaveBeenCalled();});
});
