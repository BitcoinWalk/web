"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useState} from "react";
import {queryCalendarEvents,queryDirectoryRecords} from "../nostr/city-records";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig} from "../lib/directory-config";
import {approvedDirectory,directoryWithWalkSchedule,filterDirectory,directoryImageCandidates,type DirectoryCity} from "../domain/directory";
import {approvedCalendarWalks,initialCalendarHero} from "../nostr/calendar-records";
import {managedCalendarEvents} from "../domain/event-routing";
import {DEFAULT_HOME_PAGE,HOME_PAGE_ID,type ContentPage} from "../domain/content";
import {latestContentPages,queryContentRevisions} from "../nostr/content-records";
import {filterHomeSponsoredWalks,type HomeSponsoredWalk} from "../domain/home-sponsored-walks";
import {heroObjectPosition} from "../domain/hero-presentation";
import {isLuganoPlanBConference} from "../domain/share-campaign";
import SponsoredWalks from "./sponsored-walks";
import styles from "./city-directory.module.css";
const DirectoryMap=dynamic(()=>import("./directory-map"),{ssr:false,loading:()=> <p>Loading map…</p>});
export const compactHomepageBrand=(scrollY:number)=>scrollY>72;
export const homepageCtaLabel=(label:string)=>label==="Find your city ↓"?"Find your walk ↓":label;
function Photo({src,alt}:{src?:string;alt:string}) {
  const candidates=directoryImageCandidates(src),[attempt,setAttempt]=useState(0),image=candidates[attempt];
  // Browser-loaded public images, not server-side URL fetches.
  // eslint-disable-next-line @next/next/no-img-element
  return image?<img className={styles.photo} src={image} alt={alt} style={{objectPosition:heroObjectPosition(src)}} loading="lazy" referrerPolicy="no-referrer" onError={()=>setAttempt(value=>value+1)}/>:<div className={styles.placeholder} aria-hidden="true">₿ / WALK</div>;
}
function Card({row}:{row:DirectoryCity}) {
  const {city}=row;
  const luganoPlanB=isLuganoPlanBConference(city.slug,[city.heroImageUrl]);
  return <article className={styles.card}>
    <div className={styles.cardMedia} data-campaign={luganoPlanB?"lugano-planb":undefined}>
      <Photo key={city.heroImageUrl} src={luganoPlanB?"/brand/campaigns/lugano-planb-background.webp":city.heroImageUrl} alt={`BitcoinWalk in ${city.cityName}`}/>
      {luganoPlanB&&<Image className={styles.campaignLogo} src="/brand/campaigns/lugano-planb-forum-2026.png" width={408} height={225} alt="Plan ₿ Forum — Lugano, October 23–24, 2026"/>}
    </div>
    <div className={styles.content}><p className={styles.eyebrow}>{row.tier==="paid"?"Dedicated city relay":"Community walk"}</p>
      <h3><a href={row.href}>BitcoinWalk {city.cityName}</a></h3>
      <p>{row.hasUpcomingWalk?new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(city.startAt)):"No upcoming walk scheduled."}</p>
      <p>{city.meetingPoint.description}</p>
      <a className={styles.link} href={row.href}>View walk →</a>
    </div>
  </article>;
}
export default function CityDirectory({sponsoredWalks=[]}:{sponsoredWalks?:HomeSponsoredWalk[]}) {
  const [rows,setRows]=useState<DirectoryCity[]>([]);
  const [query,setQuery]=useState("");
  const [view,setView]=useState<"list"|"map">("list");
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  const [content,setContent]=useState<ContentPage>(DEFAULT_HOME_PAGE);
  const [compactBrand,setCompactBrand]=useState(false);
  useEffect(()=>{const update=()=>setCompactBrand(compactHomepageBrand(window.scrollY));update();window.addEventListener("scroll",update,{passive:true});return()=>window.removeEventListener("scroll",update);},[]);
  useEffect(()=>{
    let active=true;
    Promise.allSettled([queryDirectoryRecords(relayConfig.readRelays),queryCalendarEvents(relayConfig.readRelays),queryContentRevisions(relayConfig.readRelays)]).then(([directory,calendar,contentResult])=>{
      if(!active)return;if(directory.status==="rejected"||calendar.status==="rejected"||calendar.value.length>=500){setError("We couldn’t load the current walks completely. The relay may be temporarily unavailable or rate-limited. Please try again in a few minutes.");setStatus("error");return;}const {revisions,approvals}=directory.value,walks=approvedCalendarWalks(revisions,approvals),current=new Map(walks.flatMap(walk=>{const occurrence=managedCalendarEvents(walk,calendar.value).find(item=>item.status==="active"||item.status==="upcoming");return occurrence?[[walk.revision.city.cityId,{...occurrence,heroImageUrl:initialCalendarHero(occurrence.event,walk)}] as const]:[];}));setRows(directoryWithWalkSchedule(approvedDirectory(revisions,approvals,directoryConfig.paidCities),current));if(contentResult.status==="fulfilled"){const home=latestContentPages(contentResult.value).find(row=>row.page.pageId===HOME_PAGE_ID&&row.page.published);setContent(home?.page??DEFAULT_HOME_PAGE);}setStatus("ready");
    });
    return ()=>{active=false;};
  },[attempt]);
  const filtered=filterDirectory(rows,query),filteredSponsored=filterHomeSponsoredWalks(sponsoredWalks,query);
  return <main className={styles.home}>
    <nav className={styles.nav} data-compact={compactBrand}><Link className={styles.brand} data-compact={compactBrand} href="/" aria-label="BitcoinWalk homepage"><span><Image className={styles.wordmark} src="/brand/bitcoinwalk-horizontal.png" width={1690} height={312} priority alt="BitcoinWalk"/><Image className={styles.icon} src="/brand/bitcoinwalk-icon.png" width={312} height={312} priority alt="" aria-hidden="true"/></span></Link><div><Link className={styles.startButton} href="/start">Start a walk</Link><Link className={styles.connectLink} href="/admin" aria-label="Connect to your dashboard" title="Connect"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M9 3v4m6-4v4M7 7h10v3a5 5 0 0 1-10 0V7Zm5 8v3c0 2 1 3 3 3h2"/></svg></Link></div></nav>
    <header className={styles.hero}>{content.eyebrow&&<p className={styles.eyebrow}>{content.eyebrow}</p>}<h1>{content.title==="Good company. One walk at a time."?<>Good company.<br/>One walk at a time.</>:content.title}</h1>{content.intro&&<p>{content.intro}</p>}<div className={styles.heroActions}>{content.ctaLabel&&content.ctaHref&&<a className={styles.link} href={content.ctaHref}>{homepageCtaLabel(content.ctaLabel)}</a>}<section className={styles.walkieDownload} aria-labelledby="walkie-download-title"><a className={styles.zapstoreButton} href="https://zapstore.dev/apps/org.bitcoinwalk.walkietalkie" aria-label="Download Walkie Talkie on Zapstore"><Image className={styles.walkieIcon} src="/brand/walkie-talkie-zapstore-icon.png" width={40} height={40} alt=""/><span className={styles.walkieDownloadCopy}><h2 id="walkie-download-title">Get your BitcoinWalk companion app</h2><span className={styles.zapstoreLabel}>Download on Zapstore</span></span><span className={styles.storeArrow} aria-hidden="true">↗</span></a></section></div></header>
    {content.body&&<section>{content.body.split(/\n\s*\n/).map((paragraph,index)=><p key={index} style={{whiteSpace:"pre-wrap"}}>{paragraph}</p>)}</section>}
    <section id="find-walk" aria-labelledby="directory-title"><h2 id="directory-title">Find your city</h2>
      <div className={styles.controls}><label>Search cities or meeting points<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Let's F... Go!" /></label><div><button aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button><button aria-pressed={view==="map"} onClick={()=>setView("map")}>Map</button></div></div>
      {status==="loading"&&<p role="status">Loading approved walks…</p>}
      {status==="error"&&<div role="alert"><p>{error}</p><button onClick={()=>{setStatus("loading");setAttempt(a=>a+1);}}>Try again</button></div>}
      {status==="ready"&&<><p role="status">{filtered.length} {filtered.length===1?"city":"cities"}{query?" matching your search":" approved"}.</p>
        {view==="map"?(!filtered.length?<p>{rows.length?"No matching cities. Try another name or clear your search.":"No approved cities are available yet."}</p>:<DirectoryMap cities={filtered}/>):!filtered.length&&!filteredSponsored.length?<p>{rows.length?"No matching cities. Try another name or clear your search.":"No approved cities are available yet."}</p>:<SponsoredWalks walks={filteredSponsored}>{filtered.map(row=><Card key={row.city.cityId} row={row}/>)}</SponsoredWalks>}
        <p className={styles.muted}>Times are shown in your device’s timezone. Map pins mark approved meeting points.</p></>}
    </section>
    <footer className={styles.footer}>{content.footerTitle&&<h2>{content.footerTitle}</h2>}{content.footerText&&<p>{content.footerText}</p>}{content.footerCtaLabel&&<Link className={styles.link} href="/start">{content.footerCtaLabel}</Link>}</footer>
  </main>;
}
