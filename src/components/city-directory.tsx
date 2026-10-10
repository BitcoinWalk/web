"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useState} from "react";
import {queryCalendarEvents,queryDirectoryRecords} from "../nostr/city-records";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig} from "../lib/directory-config";
import {approvedDirectory,directoryWithUpcomingWalks,filterDirectory,directoryImage,type DirectoryCity} from "../domain/directory";
import {approvedCalendarWalks} from "../nostr/calendar-records";
import {managedCalendarEvents} from "../domain/event-routing";
import {DEFAULT_HOME_PAGE,HOME_PAGE_ID,type ContentPage} from "../domain/content";
import {latestContentPages,queryContentRevisions} from "../nostr/content-records";
import {DEFAULT_FEATURE_FLAGS} from "../domain/feature-flags";
import {latestFeatureFlags,queryFeatureFlags} from "../nostr/feature-flags";
import {heroObjectPosition} from "../domain/hero-presentation";
import styles from "./city-directory.module.css";
const DirectoryMap=dynamic(()=>import("./directory-map"),{ssr:false,loading:()=> <p>Loading map…</p>});
export const compactHomepageBrand=(scrollY:number)=>scrollY>72;
function Photo({src,alt}:{src?:string;alt:string}) {
  const [failed,setFailed]=useState(false);
  // Browser-loaded public images, not server-side URL fetches.
  // eslint-disable-next-line @next/next/no-img-element
  return src&&!failed?<img className={styles.photo} src={src} alt={alt} style={{objectPosition:heroObjectPosition(src)}} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className={styles.placeholder} aria-hidden="true">₿ / WALK</div>;
}
function Card({row,featured=false}:{row:DirectoryCity;featured?:boolean}) {
  const {city}=row;
  return <article className={styles.card}>
    <Photo key={city.heroImageUrl} src={directoryImage(city.heroImageUrl)} alt={`BitcoinWalk in ${city.cityName}`}/>
    <div className={styles.content}><p className={styles.eyebrow}>{row.tier==="paid"?"Dedicated city relay":"Community walk"}</p>
      <h3><a href={row.href}>BitcoinWalk {city.cityName}</a></h3>
      <p>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(city.startAt))}</p>
      <p>{city.meetingPoint.description}</p>
      {featured&&city.sponsor&&<div className={styles.sponsor}>
        {directoryImage(city.sponsor.logoUrl)&&<Photo key={city.sponsor.logoUrl} src={directoryImage(city.sponsor.logoUrl)} alt={`${city.sponsor.name} logo`}/>}
        <strong>Powered by {city.sponsor.name}</strong>
        {city.sponsor.offer&&<p>{city.sponsor.offer}</p>}
      </div>}
      <a className={styles.link} href={row.href}>View walk →</a>
    </div>
  </article>;
}
export default function CityDirectory() {
  const [rows,setRows]=useState<DirectoryCity[]>([]);
  const [query,setQuery]=useState("");
  const [view,setView]=useState<"list"|"map">("list");
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  const [content,setContent]=useState<ContentPage>(DEFAULT_HOME_PAGE);
  const [showFeatured,setShowFeatured]=useState(DEFAULT_FEATURE_FLAGS.featuredCityWalks);
  const [compactBrand,setCompactBrand]=useState(false);
  useEffect(()=>{const update=()=>setCompactBrand(compactHomepageBrand(window.scrollY));update();window.addEventListener("scroll",update,{passive:true});return()=>window.removeEventListener("scroll",update);},[]);
  useEffect(()=>{
    let active=true;
    Promise.allSettled([queryDirectoryRecords(relayConfig.readRelays),queryCalendarEvents(relayConfig.readRelays),queryContentRevisions(relayConfig.readRelays),queryFeatureFlags(relayConfig.readRelays)]).then(([directory,calendar,contentResult,featureFlags])=>{
      if(!active)return;if(directory.status==="rejected"||calendar.status==="rejected"||calendar.value.length>=500){setError("We couldn’t load the current walks completely. The relay may be temporarily unavailable or rate-limited. Please try again in a few minutes.");setStatus("error");return;}const {revisions,approvals}=directory.value,walks=approvedCalendarWalks(revisions,approvals),current=new Map(walks.flatMap(walk=>{const occurrence=managedCalendarEvents(walk,calendar.value).find(item=>item.status==="active"||item.status==="upcoming");return occurrence?[[walk.revision.city.cityId,occurrence] as const]:[];}));setRows(directoryWithUpcomingWalks(approvedDirectory(revisions,approvals,directoryConfig.paidCities),current));if(contentResult.status==="fulfilled"){const home=latestContentPages(contentResult.value).find(row=>row.page.pageId===HOME_PAGE_ID&&row.page.published);setContent(home?.page??DEFAULT_HOME_PAGE);}setShowFeatured(featureFlags.status==="fulfilled"?(latestFeatureFlags(featureFlags.value)?.flags.featuredCityWalks??DEFAULT_FEATURE_FLAGS.featuredCityWalks):DEFAULT_FEATURE_FLAGS.featuredCityWalks);setStatus("ready");
    });
    return ()=>{active=false;};
  },[attempt]);
  const filtered=filterDirectory(rows,query),featured=rows.filter(row=>row.featured);
  return <main className={styles.home}>
    <nav className={styles.nav} data-compact={compactBrand}><Link className={styles.brand} data-compact={compactBrand} href="/" aria-label="BitcoinWalk homepage"><span><Image className={styles.wordmark} src="/brand/bitcoinwalk-horizontal.png" width={1690} height={312} priority alt="BitcoinWalk"/><Image className={styles.icon} src="/brand/bitcoinwalk-icon.png" width={312} height={312} priority alt="" aria-hidden="true"/></span></Link><div><Link className={styles.startButton} href="/start">Start a walk</Link><Link className={styles.connectLink} href="/admin" aria-label="Connect to your dashboard" title="Connect"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M9 3v4m6-4v4M7 7h10v3a5 5 0 0 1-10 0V7Zm5 8v3c0 2 1 3 3 3h2"/></svg></Link></div></nav>
    <header className={styles.hero}>{content.eyebrow&&<p className={styles.eyebrow}>{content.eyebrow}</p>}<h1>{content.title==="Good company. One walk at a time."?<>Good company.<br/>One walk at a time.</>:content.title}</h1>{content.intro&&<p>{content.intro}</p>}{content.ctaLabel&&content.ctaHref&&<a className={styles.link} href={content.ctaHref}>{content.ctaLabel}</a>}</header>
    {content.body&&<section>{content.body.split(/\n\s*\n/).map((paragraph,index)=><p key={index} style={{whiteSpace:"pre-wrap"}}>{paragraph}</p>)}</section>}
    <p className={styles.muted}>Staging preview · Approved cities from the staging relay. This is not the legacy production directory.</p>
    {showFeatured&&<section aria-labelledby="featured-title"><h2 id="featured-title">Featured city walks</h2><p>Local communities with dedicated relays, supported by their partners.</p>
      {featured.length>0?<div className={styles.grid}>{featured.map(row=><Card key={row.city.cityId} row={row} featured/>)}</div>:<div className={styles.featurePlaceholder}><strong>Featured cities and sponsors will appear here.</strong><p>Only confirmed paid cities and approved sponsor details are displayed. No paid cities are configured for this preview yet.</p></div>}
    </section>}
    <section id="find-walk" aria-labelledby="directory-title"><h2 id="directory-title">Find your city</h2>
      <div className={styles.controls}><label>Search cities or meeting points<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Let's F... Go!" /></label><div><button aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button><button aria-pressed={view==="map"} onClick={()=>setView("map")}>Map</button></div></div>
      {status==="loading"&&<p role="status">Loading approved walks…</p>}
      {status==="error"&&<div role="alert"><p>{error}</p><button onClick={()=>{setStatus("loading");setAttempt(a=>a+1);}}>Try again</button></div>}
      {status==="ready"&&<><p role="status">{filtered.length} {filtered.length===1?"city":"cities"}{query?" matching your search":" with approved walks"}.</p>
        {!filtered.length?<p>{rows.length?"No matching cities. Try another name or clear your search.":"No approved walks are available in this staging directory yet."}</p>:view==="map"?<DirectoryMap cities={filtered}/>:<div className={styles.grid}>{filtered.map(row=><Card key={row.city.cityId} row={row}/>)}</div>}
        <p className={styles.muted}>Times are shown in your device’s timezone. Map pins mark approved meeting points.</p></>}
    </section>
    <footer className={styles.footer}>{content.footerTitle&&<h2>{content.footerTitle}</h2>}{content.footerText&&<p>{content.footerText}</p>}{content.footerCtaLabel&&<Link className={styles.link} href="/start">{content.footerCtaLabel}</Link>}</footer>
  </main>;
}
