"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {useEffect,useState} from "react";
import {queryDirectoryRecords} from "../nostr/city-records";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig} from "../lib/directory-config";
import {approvedDirectory,filterDirectory,directoryImage,type DirectoryCity} from "../domain/directory";
import styles from "./city-directory.module.css";
const Map=dynamic(()=>import("./directory-map"),{ssr:false,loading:()=> <p>Loading map…</p>});
function Photo({src,alt}:{src?:string;alt:string}) {
  const [failed,setFailed]=useState(false);
  // Browser-loaded public images, not server-side URL fetches.
  // eslint-disable-next-line @next/next/no-img-element
  return src&&!failed?<img className={styles.photo} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className={styles.placeholder} aria-hidden="true">₿ / WALK</div>;
}
function Card({row,featured=false}:{row:DirectoryCity;featured?:boolean}) {
  const {city}=row;
  const [now]=useState(()=>Date.now());
  return <article className={styles.card}>
    <Photo key={city.heroImageUrl} src={directoryImage(city.heroImageUrl)} alt={`BitcoinWalk in ${city.cityName}`}/>
    <div className={styles.content}><p className={styles.eyebrow}>{row.tier==="paid"?"Dedicated city relay":"Community walk"}</p>
      <h3><a href={row.href}>BitcoinWalk {city.cityName}</a></h3>
      <p>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(city.startAt))}</p>
      <p>{city.meetingPoint.description}</p>
      {new Date(city.startAt).getTime()<now&&<p className={styles.muted}>Last published date — check with the organizer for the next walk.</p>}
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
  useEffect(()=>{
    let active=true;
    queryDirectoryRecords(relayConfig.readRelays).then(({revisions,approvals})=>{
      if(active){setRows(approvedDirectory(revisions,approvals,directoryConfig.paidCities));setStatus("ready");}
    }).catch(()=>{if(active){setError("We couldn’t load the approved walks. The relay may be temporarily unavailable or rate-limited. Please try again in a few minutes.");setStatus("error");}});
    return ()=>{active=false;};
  },[attempt]);
  const filtered=filterDirectory(rows,query),featured=rows.filter(row=>row.featured);
  return <main className={styles.home}>
    <nav className={styles.nav}><Link href="/">BitcoinWalk</Link><div><Link href="/admin">Dashboard</Link><Link href="/start">Start a walk</Link></div></nav>
    <header className={styles.hero}><p className={styles.eyebrow}>Step outside. Meet your local Bitcoin community.</p><h1>Good company.<br/>One walk at a time.</h1><p>Find a BitcoinWalk near you. Bring your curiosity, meet fellow Bitcoiners, and take the conversation outside.</p><a className={styles.link} href="#find-walk">Find your city ↓</a></header>
    <p className={styles.muted}>Staging preview · Approved cities from the staging relay. This is not the legacy production directory.</p>
    <section aria-labelledby="featured-title"><h2 id="featured-title">Featured city walks</h2><p>Local communities with dedicated relays, supported by their partners.</p>
      {featured.length>0?<div className={styles.grid}>{featured.map(row=><Card key={row.city.cityId} row={row} featured/>)}</div>:<div className={styles.featurePlaceholder}><strong>Featured cities and sponsors will appear here.</strong><p>Only confirmed paid cities and approved sponsor details are displayed. No paid cities are configured for this preview yet.</p></div>}
    </section>
    <section id="find-walk" aria-labelledby="directory-title"><h2 id="directory-title">Find your city</h2>
      <div className={styles.controls}><label>Search cities or meeting points<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try Radom…" /></label><div><button aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button><button aria-pressed={view==="map"} onClick={()=>setView("map")}>Map</button></div></div>
      {status==="loading"&&<p role="status">Loading approved walks…</p>}
      {status==="error"&&<div role="alert"><p>{error}</p><button onClick={()=>{setStatus("loading");setAttempt(a=>a+1);}}>Try again</button></div>}
      {status==="ready"&&<><p role="status">{filtered.length} {filtered.length===1?"city":"cities"}{query?" matching your search":" with approved walks"}.</p>
        {!filtered.length?<p>{rows.length?"No matching cities. Try another name or clear your search.":"No approved walks are available in this staging directory yet."}</p>:view==="map"?<Map cities={filtered}/>:<div className={styles.grid}>{filtered.map(row=><Card key={row.city.cityId} row={row}/>)}</div>}
        <p className={styles.muted}>Times are shown in your device’s timezone. Map pins mark approved meeting points.</p></>}
    </section>
    <footer className={styles.footer}><h2>Your city could be next.</h2><p>Start a local BitcoinWalk and help people connect in person.</p><Link className={styles.link} href="/start">Start a BitcoinWalk →</Link></footer>
  </main>;
}
