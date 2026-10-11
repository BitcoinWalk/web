"use client";
import {useEffect,useState} from "react";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import type {PublicCityPaymentAction} from "../domain/public-city-payment";
import type {Event} from "nostr-tools";
import AdaptiveLightningAction from "./adaptive-lightning-action";
import NostrUser from "./nostr-user";
import VerifiedZap from "./verified-zap";
import styles from "./walk-host.module.css";

export default function WalkHost({pubkey,profile:provided,resolveProfile=true,payment,event}:{pubkey:string;profile?:PublicProfile;resolveProfile?:boolean;payment:PublicCityPaymentAction;event?:Event}){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,profile)=>{if(key===pubkey)setResolved({pubkey:key,profile});}):()=>{},[pubkey,resolveProfile]);
 const profile={...provided,...(resolved?.pubkey===pubkey?resolved.profile:{})};
 return <section className={styles.host} aria-labelledby="walk-host-heading"><h2 id="walk-host-heading">Hosted by</h2><NostrUser pubkey={pubkey} profile={profile} resolveProfile={false} showLightning={false} profileLink/>
  {payment.kind==="zap"?<VerifiedZap href={payment.href} recipient={pubkey} event={event}/>:
   payment.kind==="donate"?<AdaptiveLightningAction className={styles.zap} href={payment.href} title="Donate to BitcoinWalk HQ">Donate to BitcoinWalk HQ ⚡</AdaptiveLightningAction>:
   <p className={styles.unavailable}>City Lightning payments are not enabled yet.</p>}
 </section>;
}
