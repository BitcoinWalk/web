import {describe,expect,it} from "vitest";
import {eventsIcalendar,eventsRss} from "./public-event-formats";
import type {PublicEventsFeed} from "./public-events-feed";

const organizerNpub="npub1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygse4sl3h";
const feed:PublicEventsFeed={version:1,generatedAt:"2026-11-01T00:00:00.000Z",events:[{id:"a".repeat(64),name:"BitcoinWalk Łódź & friends",description:"Line one\nLine two, bring curiosity; walk.",startDate:"2026-11-07T18:00:00.000Z",endDate:"2026-11-07T20:00:00.000Z",timeZone:"Europe/Warsaw",link:"https://bitcoinwalk.org/lodz/nevent1test",organizerNpub,address:"Café <Central>",latitude:51.7592,longitude:19.456,image:"https://bitcoinwalk.org/api/og/files/test.jpg"}]};

describe("public event formats",()=>{
 it("renders a CRLF iCalendar feed with stable Nostr UIDs, coordinates and images",()=>{
  const value=eventsIcalendar(feed,"https://bitcoinwalk.org");
  const unfolded=value.replace(/\r\n /g,"");
  expect(value).toMatch(/^BEGIN:VCALENDAR\r\n/);expect(value.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(unfolded).toContain(`UID:${"a".repeat(64)}@bitcoinwalk.org`);
  expect(unfolded).toContain("DTSTART:20261107T180000Z");expect(unfolded).toContain("DTEND:20261107T200000Z");
  expect(unfolded).toContain("GEO:51.7592;19.456");expect(unfolded).toContain("IMAGE;VALUE=URI;FMTTYPE=image/jpeg;DISPLAY=FULLSIZE:");
  expect(unfolded).toContain("DESCRIPTION:Line one\\nLine two\\, bring curiosity\\; walk.");
  expect(unfolded).toContain(`X-BITCOINWALK-ORGANIZER-NPUB:${organizerNpub}`);
  expect(value.split("\r\n").every(line=>Buffer.byteLength(line,"utf8")<=75)).toBe(true);
 });
 it("renders valid escaped RSS with event extensions and sponsor-aware image URLs",()=>{
  const value=eventsRss(feed,"https://bitcoinwalk.org");
  expect(value).toContain('<rss version="2.0"');expect(value).toContain("BitcoinWalk Łódź &amp; friends");expect(value).toContain("Café &lt;Central&gt;");
  expect(value).toContain("<bw:startDate>2026-11-07T18:00:00.000Z</bw:startDate>");expect(value).toContain("<geo:lat>51.7592</geo:lat>");
  expect(value).toContain('media:content url="https://bitcoinwalk.org/api/og/files/test.jpg"');
  expect(value).toContain(`<bw:organizerNpub>${organizerNpub}</bw:organizerNpub>`);
 });
});
