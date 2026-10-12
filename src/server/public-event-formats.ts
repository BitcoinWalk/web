import type {PublicEventsFeed} from "./public-events-feed";

function xml(value:string):string{return value.replace(/[<>&"']/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"})[char]!);}
function icsText(value:string):string{return value.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/([;,])/g,"\\$1");}
function icsUri(value:string):string{return value.replace(/\\/g,"\\\\").replace(/([;,])/g,"\\$1");}
function utc(value:string):string{return new Date(value).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}

/** RFC 5545 content lines are folded at 75 octets, never through a UTF-8 code point. */
function fold(line:string):string{
 const chunks:string[]=[];let current="";
 for(const character of line){
  const limit=chunks.length?74:75;
  if(Buffer.byteLength(current+character,"utf8")>limit){chunks.push(current);current=character;}else current+=character;
 }
 chunks.push(current);return chunks.join("\r\n ");
}

export function eventsIcalendar(feed:PublicEventsFeed,origin:string):string{
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//BitcoinWalk//Future walks//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","NAME:BitcoinWalk future walks","X-WR-CALNAME:BitcoinWalk future walks",`SOURCE;VALUE=URI:${origin}/events.ics`,`REFRESH-INTERVAL;VALUE=DURATION:PT5M`];
 for(const event of feed.events)lines.push(
  "BEGIN:VEVENT",
  `UID:${event.id}@bitcoinwalk.org`,
  `DTSTAMP:${utc(feed.generatedAt)}`,
  `DTSTART:${utc(event.startDate)}`,
  ...(event.endDate?[`DTEND:${utc(event.endDate)}`]:[]),
  `SUMMARY:${icsText(event.name)}`,
  `DESCRIPTION:${icsText(event.description)}`,
  `LOCATION:${icsText(event.address)}`,
  `GEO:${event.latitude};${event.longitude}`,
  `URL:${icsUri(event.link)}`,
  `IMAGE;VALUE=URI;FMTTYPE=image/jpeg;DISPLAY=FULLSIZE:${icsUri(event.image)}`,
  `X-BITCOINWALK-TIMEZONE:${icsText(event.timeZone)}`,
  `X-NOSTR-EVENT-ID:${event.id}`,
  "CATEGORIES:BitcoinWalk,Bitcoin",
  "STATUS:CONFIRMED",
  "END:VEVENT",
 );
 lines.push("END:VCALENDAR");
 return lines.map(fold).join("\r\n")+"\r\n";
}

export function eventsRss(feed:PublicEventsFeed,origin:string):string{
 const items=feed.events.map(event=>`    <item>
      <title>${xml(event.name)}</title>
      <link>${xml(event.link)}</link>
      <guid isPermaLink="false">urn:nostr:${event.id}</guid>
      <description>${xml(event.description)}</description>
      <bw:startDate>${xml(event.startDate)}</bw:startDate>${event.endDate?`\n      <bw:endDate>${xml(event.endDate)}</bw:endDate>`:""}
      <bw:timeZone>${xml(event.timeZone)}</bw:timeZone>
      <bw:address>${xml(event.address)}</bw:address>
      <geo:lat>${event.latitude}</geo:lat>
      <geo:long>${event.longitude}</geo:long>
      <media:content url="${xml(event.image)}" type="image/jpeg" medium="image" />
    </item>`).join("\n");
 return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:bw="https://bitcoinwalk.org/dev#" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>BitcoinWalk future walks</title>
    <link>${origin}</link>
    <description>Verified upcoming BitcoinWalk events from signed Nostr records.</description>
    <language>en</language>
    <lastBuildDate>${new Date(feed.generatedAt).toUTCString()}</lastBuildDate>
    <ttl>5</ttl>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${origin}/events.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
