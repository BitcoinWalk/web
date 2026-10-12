import {afterEach,describe,expect,it,vi} from "vitest";

afterEach(()=>vi.resetModules());

describe("public future-events endpoint",()=>{
 it("returns a cross-origin cacheable versioned feed",async()=>{
  vi.doMock("../../../server/public-events-feed",()=>({loadPublicEventsFeed:vi.fn().mockResolvedValue({version:1,generatedAt:"2026-11-01T00:00:00.000Z",events:[{id:"a".repeat(64)}]})}));
  const {GET}=await import("./route"),response=await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("cache-control")).toContain("max-age=60");
  expect(await response.json()).toMatchObject({version:1,events:[{id:"a".repeat(64)}]});
 });
 it("fails closed instead of returning a partial list",async()=>{
  vi.doMock("../../../server/public-events-feed",()=>({loadPublicEventsFeed:vi.fn().mockRejectedValue(new Error("relay unavailable"))}));
  const {GET}=await import("./route"),response=await GET();
  expect(response.status).toBe(503);expect(response.headers.get("cache-control")).toBe("no-store");
 });
});
