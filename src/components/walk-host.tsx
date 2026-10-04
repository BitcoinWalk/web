"use client";
import {useEffect,useState} from "react";
import {safeLnurl,watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import NostrUser from "./nostr-user";
import styles from "./walk-host.module.css";

export function hostZapHref(profile:PublicProfile|undefined):string|undefined{
 const destination=profile?.lnurl?safeLnurl(profile.lnurl,profile.lnurl):undefined;
 return destination?`lightning:${destination}`:undefined;
}

export default function WalkHost({pubkey,profile:provided,resolveProfile=true}:{pubkey:string;profile?:PublicProfile;resolveProfile?:boolean}){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,profile)=>{if(key===pubkey)setResolved({pubkey:key,profile});}):()=>{},[pubkey,resolveProfile]);
 const profile=resolved?.pubkey===pubkey?resolved.profile:provided,zap=hostZapHref(profile);
 return <section className={styles.host} aria-labelledby="walk-host-heading"><h2 id="walk-host-heading">Hosted by</h2><NostrUser pubkey={pubkey} profile={profile} resolveProfile={false}/>{zap?<a className={styles.zap} href={zap}>Say thanks with a zap ⚡</a>:<p className={styles.unavailable}>Zaps are not available for this host yet.</p>}</section>;
}
