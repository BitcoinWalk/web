"use client";
import Image from "next/image";
import {useEffect,useMemo,useState,type ReactNode} from "react";
import {filterHomeSponsoredWalks,sponsoredWalkPreview,type HomeSponsoredWalk} from "../domain/home-sponsored-walks";
import {watchPublicProfiles} from "../nostr/profiles";
import styles from "./city-directory.module.css";

function walkDate(row:HomeSponsoredWalk):string{
 try{return new Intl.DateTimeFormat(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",...(row.timeZone?{timeZone:row.timeZone,timeZoneName:"short"}:{}),}).format(new Date(row.start*1000));}
 catch{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(row.start*1000));}
}

export default function SponsoredWalks({walks,query="",children}:{walks:HomeSponsoredWalk[];query?:string;children?:ReactNode}){
 const [showAll,setShowAll]=useState(false),[names,setNames]=useState<Record<string,string>>({});
 const profileKeys=useMemo(()=>[...new Set(walks.map(row=>row.sponsorPubkey))].sort(),[walks]);
 useEffect(()=>watchPublicProfiles(profileKeys,(key,profile)=>{if(profile.name)setNames(current=>({...current,[key]:profile.name!}));}),[profileKeys]);
 const matching=filterHomeSponsoredWalks(walks,query),preview=sponsoredWalkPreview(matching),visible=showAll?matching:preview;
 if(!matching.length&&!children)return null;
 return <>
  <div className={styles.grid}>{visible.map(row=><a className={styles.sponsoredCard} href={row.href} key={`${row.cityId}:${row.eventId}`}>
   {row.imageUrl?<Image className={styles.sponsoredImage} src={row.imageUrl} width={1200} height={630} loading="lazy" unoptimized alt={`Sponsored BitcoinWalk in ${row.cityName}`}/>:<div className={styles.sponsoredPlaceholder} aria-hidden="true">₿ / WALK</div>}
   <div className={styles.sponsoredBody}><span className={styles.sponsoredLabel}>Sponsored</span><h3>BitcoinWalk {row.cityName}</h3><p><time dateTime={new Date(row.start*1000).toISOString()}>{walkDate(row)}</time></p><p>{row.meetingPoint}</p><p className={styles.sponsorBy}>Sponsored by {names[row.sponsorPubkey]??"a BitcoinWalk partner"}</p><strong className={styles.cardAction}>View walk →</strong></div>
  </a>)}{children}</div>
  {matching.length>preview.length&&<button className={styles.showAll} type="button" aria-expanded={showAll} onClick={()=>setShowAll(value=>!value)}>{showAll?"Show fewer":"See all sponsored walks"}</button>}
 </>;
}
