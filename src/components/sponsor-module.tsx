"use client";
import {useEffect,useState} from "react";
import {SUPER_ADMIN_NPUB} from "../domain/city";
import type {SponsorshipPresentation} from "../domain/sponsorship";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import NostrUser from "./nostr-user";
import styles from "./sponsor-module.module.css";

export default function SponsorModule({presentation}:{presentation:SponsorshipPresentation}){
 const sponsor=presentation.state==="sponsor"?presentation:null,sponsorPubkey=sponsor?.pubkey,[resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>sponsorPubkey?watchPublicProfiles([sponsorPubkey],(key,value)=>{if(key===sponsorPubkey)setResolved({pubkey:key,profile:value});}):()=>{},[sponsorPubkey]);
 const profile=resolved&&resolved.pubkey===sponsorPubkey?resolved.profile:undefined;
 if(presentation.state==="hidden")return null;
 if(presentation.state==="empty")return <section className={styles.sponsor} aria-labelledby="sponsor-heading"><h2 id="sponsor-heading">Sponsor this BitcoinWalk</h2><p>Would you like to sponsor this or a future walk?</p><a href={`https://armada.buzz/dms/${SUPER_ADMIN_NPUB}`} target="_blank" rel="noopener noreferrer">Contact BitcoinWalk on Nostr →</a></section>;
 if(!sponsor)return null;
 const website=sponsor.website;
 return <section className={styles.sponsor} aria-labelledby="sponsor-heading"><h2 id="sponsor-heading">Sponsored by</h2><NostrUser pubkey={sponsor.pubkey} profile={profile} resolveProfile={false}/>{website&&<p>Visit our website to <a href={website} target="_blank" rel="noopener noreferrer">learn more</a>.</p>}</section>;
}
