import {beforeEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({image:vi.fn()}));
vi.mock("../../../server/share-preview",()=>({cityShareImage:mocks.image}));
import {GET} from "./route";

describe("current city OG redirect",()=>{
  beforeEach(()=>{mocks.image.mockReset();});
  it("redirects the stable city URL to the exact current raw asset without caching the redirect",async()=>{
    const asset=`https://bitcoinwalk.org/api/og/files/${"a".repeat(64)}.jpg`;
    mocks.image.mockResolvedValue({url:asset,canonicalSlug:"madeira"});
    const response=await GET(new Request("https://bitcoinwalk.org/madeira/og"),{params:Promise.resolve({city:"madeira"})});
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(asset);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("resolves approved city aliases through the shared metadata resolver",async()=>{
    const asset="https://bitcoinwalk.org/brand/bitcoinwalk-share-fallback.jpg";
    mocks.image.mockResolvedValue({url:asset,canonicalSlug:"warszawa"});
    const response=await GET(new Request("https://bitcoinwalk.org/warsaw/og"),{params:Promise.resolve({city:"warsaw"})});
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(asset);
    expect(mocks.image).toHaveBeenCalledWith("warsaw");
  });
  it("returns a non-cacheable 404 for an unknown city",async()=>{
    mocks.image.mockResolvedValue(null);
    const response=await GET(new Request("https://bitcoinwalk.org/unknown/og"),{params:Promise.resolve({city:"unknown"})});
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns a retryable error when city discovery is unavailable",async()=>{
    mocks.image.mockImplementation(()=>{throw new Error("relay unavailable");});
    const response=await GET(new Request("https://bitcoinwalk.org/madeira/og"),{params:Promise.resolve({city:"madeira"})});
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
  });
});
