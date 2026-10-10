"use client";
import {useEffect,useState} from "react";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import type {PublicCityPaymentAction} from "../domain/public-city-payment";
import NostrUser from "./nostr-user";
import styles from "./walk-host.module.css";

export default function WalkHost({pubkey,profile:provided,resolveProfile=true,payment}:{pubkey:string;profile?:PublicProfile;resolveProfile?:boolean;payment:PublicCityPaymentAction}){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,profile)=>{if(key===pubkey)setResolved({pubkey:key,profile});}):()=>{},[pubkey,resolveProfile]);
 const profile={...provided,...(resolved?.pubkey===pubkey?resolved.profile:{})};
 return <section className={styles.host} aria-labelledby="walk-host-heading"><h2 id="walk-host-heading">Hosted by</h2><NostrUser pubkey={pubkey} profile={profile} resolveProfile={false} showLightning={false} profileLink/>
  {payment.kind==="zap"?<a className={styles.zap} href={payment.href}>Zap the host ⚡</a>:
   payment.kind==="donate"?<a className={styles.zap} href={payment.href}>Donate to BitcoinWalk HQ ⚡</a>:
   <p className={styles.unavailable}>City Lightning payments are not enabled yet.</p>}
 </section>;
}
