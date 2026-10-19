"use client";
/* eslint-disable @next/next/no-img-element -- approved city artwork is supplied at runtime */

import localFont from "next/font/local";
import {useState} from "react";
import type {Nip29CityRoom,Nip29Room} from "../../../nostr/nip29-chat";
import styles from "./walkie-talkie-home.module.css";

const logoFont=localFont({src:"../../../../design/city-logo-templates/v1/fonts/Ubuntu-BoldItalic.ttf",weight:"700",style:"italic",display:"swap"});

type Props={
 cities:Nip29CityRoom[];
 rooms:Nip29Room[];
 guideAvailable:boolean;
 globalRoom:Nip29Room|null;
 hostsRoom:Nip29Room|null;
 status:string;
 onCity:(room:Nip29Room)=>void;
 onGuide:()=>void;
 onGlobal:()=>void;
 onHosts:()=>void;
 onRetry:()=>void;
};

function size(name:string){const length=name.trim().length;return length>11?"long":length>7?"medium":"short";}

export default function WalkieTalkieHome({cities,rooms,guideAvailable,globalRoom,hostsRoom,status,onCity,onGuide,onGlobal,onHosts,onRetry}:Props){
 const [query,setQuery]=useState(""),rows=rooms.flatMap(room=>{const city=cities.find(candidate=>candidate.id===room.cityIds[0]);return city?[{city,room}]:[];}).sort((a,b)=>a.city.name.localeCompare(b.city.name)||a.city.id.localeCompare(b.city.id)),visible=rows.filter(({city})=>!query.trim()||city.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <main className={styles.home} aria-label="Walkie Talkie home">
  <header className={styles.header}>
   <div><p className={styles.eyebrow}>BitcoinWalk</p><h1>Walkie Talkie</h1><p>Choose a city or open one of your shared conversations.</p></div>
   <img src="/brand/bitcoinwalk-icon.png" width="64" height="64" alt="" aria-hidden="true"/>
  </header>
  <nav className={styles.shortcuts} aria-label="Shared conversations">
   <button type="button" disabled={!guideAvailable} onClick={onGuide}><img src="/brand/bitcoinwalk-admin-favicon.png" alt=""/><span><strong>Guide</strong><small>{guideAvailable?"Private DM":"Organizer only"}</small></span></button>
   <button type="button" disabled={!globalRoom} onClick={onGlobal}><img src="/brand/bitcoinwalk-icon.png" alt=""/><span><strong>Global</strong><small>{globalRoom?"Community":"Not available"}</small></span></button>
   <button type="button" disabled={!hostsRoom} onClick={onHosts}><span className={styles.hostsAvatar} aria-hidden="true">BW</span><span><strong>Hosts</strong><small>{hostsRoom?"Private group":"Host only"}</small></span></button>
  </nav>
  <section className={styles.cities} aria-labelledby="walkie-cities-title">
   <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Explore communities</p><h2 id="walkie-cities-title">Cities</h2></div><span>{rows.length}</span></div>
   {rows.length>0&&<label className={styles.search}><span>Search cities</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search all cities…"/></label>}
   {visible.length?<div className={styles.grid}>{visible.map(({city,room})=><button className={styles.tile} type="button" key={room.key} onClick={()=>onCity(room)} aria-label={`Open BitcoinWalk ${city.name}`}>
    <img className={styles.hero} src={city.heroImageUrl||city.avatarUrl||"/brand/bitcoinwalk-share-fallback.jpg"} alt="" loading="lazy" referrerPolicy="no-referrer"/>
    <span className={styles.shade} aria-hidden="true"/>
    <span className={`${styles.lockup} ${logoFont.className}`} data-size={size(city.name)} aria-hidden="true"><span className={styles.lockupSymbol}><img src="/brand/bitcoinwalk-horizontal-white.png" alt=""/></span><span>{city.name.toLocaleUpperCase()}</span></span>
   </button>)}</div>:<div className={styles.empty} role="status"><p>{rows.length?"No cities match your search.":status||"No city communities are available yet."}</p>{!rows.length&&status&&status!=="Loading chats…"&&<button type="button" onClick={onRetry}>Retry</button>}</div>}
  </section>
 </main>;
}
