import {afterEach,describe,expect,it,vi} from "vitest";

afterEach(()=>vi.resetModules());
const feed={version:1,generatedAt:"2026-11-01T00:00:00.000Z",events:[]};

describe("public subscription routes",()=>{
 it.each([
  ["iCalendar","./events.ics/route","text/calendar","bitcoinwalk-events.ics","BEGIN:VCALENDAR"],
  ["RSS","./events.xml/route","application/rss+xml",null,"<rss"],
 ])("serves the %s projection with public caching",async(_name,module,type,disposition,body)=>{
  vi.doMock("../server/public-events-feed",()=>({loadPublicEventsFeed:vi.fn().mockResolvedValue(feed)}));
  vi.doMock("../server/share-preview",()=>({shareOrigin:()=>"https://bitcoinwalk.org"}));
  const response=await (await import(module)).GET();
  expect(response.status).toBe(200);expect(response.headers.get("content-type")).toContain(type);expect(response.headers.get("access-control-allow-origin")).toBe("*");expect(response.headers.get("cache-control")).toContain("max-age=60");
  if(disposition)expect(response.headers.get("content-disposition")).toContain(disposition);expect(await response.text()).toContain(body);
 });
 it.each([["./events.ics/route"],["./events.xml/route"]])("fails closed when the verified feed is unavailable",async(module)=>{
  vi.doMock("../server/public-events-feed",()=>({loadPublicEventsFeed:vi.fn().mockRejectedValue(new Error("relay"))}));
  const response=await (await import(module)).GET();expect(response.status).toBe(503);expect(response.headers.get("cache-control")).toBe("no-store");
 });
});
