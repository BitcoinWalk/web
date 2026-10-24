"use client";
import {useEffect,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import type {SponsorshipPresentation} from "../domain/sponsorship";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import type {LogoVariantAsset} from "../logos/catalog";
import NostrUser from "./nostr-user";
import styles from "./sponsor-module.module.css";
import {DEFAULT_SPONSOR_WALK_SATS} from "../payments/sponsor-types";
import {LUGANO_EVENT_SATS} from "../payments/lugano-event";

export default function SponsorModule({presentation,cityName,cityLogo,endsAt,luganoEvent=false,priceSats}:{presentation:SponsorshipPresentation;cityName:string;cityLogo?:LogoVariantAsset;endsAt?:number;luganoEvent?:boolean;priceSats?:number}){
 const [expired,setExpired]=useState(false);
 useEffect(()=>{if(endsAt===undefined)return;let timer:ReturnType<typeof setTimeout>;const check=()=>{const remaining=endsAt*1000-Date.now();setExpired(remaining<=0);if(remaining>0)timer=setTimeout(check,Math.min(remaining,60000));};timer=setTimeout(check,0);return()=>clearTimeout(timer);},[endsAt]);
 const sponsor=presentation.state==="sponsor"?presentation:null,sponsorPubkey=sponsor?.pubkey,[resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>sponsorPubkey?watchPublicProfiles([sponsorPubkey],(key,value)=>{if(key===sponsorPubkey)setResolved({pubkey:key,profile:value});}):()=>{},[sponsorPubkey]);
 const profile=resolved&&resolved.pubkey===sponsorPubkey?resolved.profile:undefined,resolvedPriceSats=priceSats??(luganoEvent?LUGANO_EVENT_SATS:DEFAULT_SPONSOR_WALK_SATS);
 if(expired||presentation.state==="hidden")return null;
 if(presentation.state==="empty")return <section className={`${styles.sponsor} ${styles.invitation}`} aria-labelledby="sponsor-heading">
  <div className={styles.invitationCopy}>
   <span className={styles.eyebrow}>{luganoEvent?"Sponsor the Lugano conference walk":"Sponsor this walk"}</span>
   <h2 id="sponsor-heading" className={styles.srOnly}>Sponsor BitcoinWalk in {cityName}</h2>
   <Image className={styles.brandLogo} src={cityLogo?.src??"/brand/bitcoinwalk-horizontal.png"} width={cityLogo?.width??1690} height={cityLogo?.height??312} unoptimized alt={`BitcoinWalk ${cityName}`}/>
   {luganoEvent?<><h3>Keep the conversation going beyond the conference.</h3><p>Bring conference visitors and local Bitcoiners together for this Plan ₿ Forum BitcoinWalk side-event.</p><p><strong>Sunday 25 OCT · 10:00am · Lugano</strong></p><p>Sponsor this event for {resolvedPriceSats.toLocaleString("en-GB")} sats. Your logo will be displayed everywhere this walk is advertised.</p></>:<p>Help keep this and future local walks free, visible and welcoming.</p>}
  </div>
  <Link className={styles.options} href={luganoEvent?"/sponsor/lugano-planb":`/sponsor?city=${encodeURIComponent(cityName)}`}>{luganoEvent?"Sponsor this side-event":"View sponsorship options"} <span aria-hidden="true">→</span></Link>
 </section>;
 if(!sponsor)return null;
 const website=sponsor.website;
 return <section className={styles.sponsor} aria-labelledby="sponsor-heading"><h2 id="sponsor-heading">Sponsored by</h2><NostrUser pubkey={sponsor.pubkey} profile={profile} resolveProfile={false}/>{website&&<p>Visit our website to <a href={website} target="_blank" rel="noopener noreferrer">learn more</a>.</p>}</section>;
}
