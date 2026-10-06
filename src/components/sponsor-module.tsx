"use client";
import {useEffect,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {nip19} from "nostr-tools";
import type {SponsorshipPresentation} from "../domain/sponsorship";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import NostrUser from "./nostr-user";
import styles from "./sponsor-module.module.css";

export default function SponsorModule({presentation,cityName,ogImageUrl,endsAt}:{presentation:SponsorshipPresentation;cityName:string;ogImageUrl?:string;endsAt?:number}){
 const [expired,setExpired]=useState(false);
 useEffect(()=>{if(endsAt===undefined)return;let timer:ReturnType<typeof setTimeout>;const check=()=>{const remaining=endsAt*1000-Date.now();setExpired(remaining<=0);if(remaining>0)timer=setTimeout(check,Math.min(remaining,60000));};timer=setTimeout(check,0);return()=>clearTimeout(timer);},[endsAt]);
 const sponsor=presentation.state==="sponsor"?presentation:null,sponsorPubkey=sponsor?.pubkey,[resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>sponsorPubkey?watchPublicProfiles([sponsorPubkey],(key,value)=>{if(key===sponsorPubkey)setResolved({pubkey:key,profile:value});}):()=>{},[sponsorPubkey]);
 const profile=resolved&&resolved.pubkey===sponsorPubkey?resolved.profile:undefined;
 if(expired||presentation.state==="hidden")return null;
 if(presentation.state==="empty")return <section className={`${styles.sponsor} ${styles.invitation}`} aria-labelledby="sponsor-heading"><div><h2 id="sponsor-heading">Sponsor BitcoinWalk in {cityName}</h2><p>Support this or an upcoming local walk.</p></div><Link className={styles.options} href={`/sponsor?city=${encodeURIComponent(cityName)}`}>View sponsorship options →</Link></section>;
 if(!sponsor)return null;
 const website=sponsor.website;
 return <section className={styles.sponsor} aria-labelledby="sponsor-heading"><h2 id="sponsor-heading">Sponsored by</h2><NostrUser pubkey={sponsor.pubkey} profile={profile} resolveProfile={false}/><p className={styles.npub}><strong>npub:</strong> <code>{nip19.npubEncode(sponsor.pubkey)}</code></p>{ogImageUrl&&<Image className={styles.ogImage} src={ogImageUrl} width={1200} height={630} sizes="(max-width: 48rem) 100vw, 44rem" unoptimized alt={`BitcoinWalk ${cityName} powered by its sponsor`}/>} {website&&<p>Visit our website to <a href={website} target="_blank" rel="noopener noreferrer">learn more</a>.</p>}</section>;
}
