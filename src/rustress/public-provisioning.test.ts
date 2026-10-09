import {describe, expect, it, vi} from "vitest";
import {verifyCityLnurl, verifyCityNip05, verifyCityPublicProvisioning} from "./public-provisioning";

const input = {publicOrigin:"https://bitcoinwalk.org",domain:"bitcoinwalk.org",localPart:"madeira",brandPubkey:"a".repeat(64)};
const headers = {"access-control-allow-origin":"*","content-type":"application/json; charset=utf-8"};
const nip05 = {names:{madeira:input.brandPubkey}};
const lnurl = {tag:"payRequest",callback:"https://bitcoinwalk.org/api/lnurl/callback/madeira",minSendable:1000,maxSendable:100_000_000,
  metadata:JSON.stringify([["text/plain","BitcoinWalk in Madeira"]])};
const response = (body:unknown, init:ResponseInit={}) => new Response(JSON.stringify(body),{status:200,headers,...init});
function transport(nip = nip05, pay = lnurl) {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    expect(options).toMatchObject({method:"GET",redirect:"error",cache:"no-store"});
    return String(url).includes("nostr.json") ? response(nip) : response(pay);
  }) as unknown as typeof fetch;
}

describe("public city provisioning verification",()=>{
  it("independently verifies the exact canonical NIP-05 and LNURL-pay endpoints",async()=>{
    const fetcher=transport();
    await expect(verifyCityPublicProvisioning(input,fetcher)).resolves.toMatchObject({
      nip05:{state:"verified",identifier:"madeira@bitcoinwalk.org",pubkey:input.brandPubkey},
      lnurl:{state:"verified",address:"madeira@bitcoinwalk.org",callback:lnurl.callback}});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects wrong identities, aliases and missing public CORS",async()=>{
    await expect(verifyCityNip05(input,transport({names:{madeira:"b".repeat(64)}}))).rejects.toThrow("invalid");
    await expect(verifyCityNip05({...input,localPart:"Madeira"},transport())).rejects.toThrow("invalid");
    const noCors=vi.fn(async()=>response(nip05,{headers:{"content-type":"application/json"}})) as unknown as typeof fetch;
    await expect(verifyCityNip05(input,noCors)).rejects.toThrow("invalid");
  });
  it("rejects off-origin or insecure callbacks and premature NIP-57 claims",async()=>{
    for(const changed of [
      {...lnurl,callback:"https://wallet.example/callback"},
      {...lnurl,callback:"http://bitcoinwalk.org/callback"},
      {...lnurl,allowsNostr:false},
      {...lnurl,nostrPubkey:"b".repeat(64)},
    ]) await expect(verifyCityLnurl(input,transport(nip05,changed))).rejects.toThrow("invalid");
  });
  it("does not require browser CORS on the wallet-facing LNURL metadata route",async()=>{
    const fetcher=vi.fn(async()=>response(lnurl,{headers:{"content-type":"application/json"}})) as unknown as typeof fetch;
    await expect(verifyCityLnurl(input,fetcher)).resolves.toMatchObject({state:"verified"});
  });
  it("rejects malformed ranges, metadata and oversized responses",async()=>{
    await expect(verifyCityLnurl(input,transport(nip05,{...lnurl,minSendable:2000,maxSendable:1000}))).rejects.toThrow("invalid");
    await expect(verifyCityLnurl(input,transport(nip05,{...lnurl,metadata:JSON.stringify([["image/png;base64","x"]])}))).rejects.toThrow("invalid");
    const huge=vi.fn(async()=>response({names:{madeira:input.brandPubkey},padding:"x".repeat(70_000)})) as unknown as typeof fetch;
    await expect(verifyCityNip05(input,huge)).rejects.toThrow("invalid");
  });
  it("keeps staging aliases and non-canonical origins out of financial identity",async()=>{
    await expect(verifyCityNip05({...input,publicOrigin:"https://app-staging.bitcoinwalk.org"},transport())).rejects.toThrow("invalid");
    await expect(verifyCityNip05({...input,localPart:"warszawa/warsaw"},transport())).rejects.toThrow("invalid");
  });
});
