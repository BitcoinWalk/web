import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./dev.module.css";

export const metadata:Metadata={title:"Developer feeds | BitcoinWalk",description:"Open BitcoinWalk event feeds for apps, calendars and feed readers."};
const feeds=[
 {title:"JSON API",href:"/api/events",format:"application/json",copy:"Structured integration feed with signed Nostr IDs, canonical links, times, coordinates and current OG images."},
 {title:"Calendar subscription",href:"/events.ics",format:"text/calendar",copy:"Subscribe from Apple Calendar, Google Calendar, Outlook, Thunderbird and other iCalendar clients."},
 {title:"RSS feed",href:"/events.xml",format:"application/rss+xml",copy:"Follow future walks in feed readers or consume the XML event, GeoRSS and Media RSS fields."},
];
export default function DeveloperFeeds(){return <main className={styles.page}><Link className={styles.brand} href="/" aria-label="BitcoinWalk homepage"><Image src="/brand/bitcoinwalk-horizontal.png" width={1690} height={312} priority alt="BitcoinWalk"/></Link><p className={styles.eyebrow}>BitcoinWalk / developers</p><h1>Future-event feeds</h1><p className={styles.intro}>Open, read-only feeds generated from BitcoinWalk’s verified Nostr events. They contain only upcoming walks in currently approved cities and use the current city OG image, including approved sponsor artwork where applicable.</p><section className={styles.grid} aria-label="Available event feeds">{feeds.map(feed=><article className={styles.card} key={feed.href}><h2>{feed.title}</h2><code>{feed.format}</code><p>{feed.copy}</p><a href={feed.href}>{feed.href}</a></article>)}</section><section className={styles.notes}><h2>Data guarantees</h2><ul><li>The signed Nostr event ID is the stable event identifier.</li><li>Times are ISO 8601 in JSON/XML and UTC instants in iCalendar; the original IANA timezone is retained.</li><li>Cancelled, hidden, past and unapproved walks are excluded.</li><li>A temporary relay or sponsorship-resolution failure returns HTTP 503 instead of a partial list.</li><li>Feeds may be cached for 60 seconds and support cross-origin reads.</li></ul></section><p><Link href="/">Back to BitcoinWalk</Link></p></main>;}
