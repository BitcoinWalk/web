"use client";
import {useEffect,useState} from "react";
import {safeLnurl,watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import NostrUser from "./nostr-user";
import styles from "./walk-host.module.css";

export function hostZapHref(profile:PublicProfile|undefined):string|undefined{
 const destination=profile?.lnurl?safeLnurl(profile.lnurl,profile.lnurl):undefined;
 return destination?`lightning:${destination}`:undefined;
}

export default function WalkHost({pubkey,profile:provided,resolveProfile=true,branded=false}:{pubkey:string;profile?:PublicProfile;resolveProfile?:boolean;branded?:boolean}){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>();
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,profile)=>{if(key===pubkey)setResolved({pubkey:key,profile});}):()=>{},[pubkey,resolveProfile]);
 const profile={...provided,...(resolved?.pubkey===pubkey?resolved.profile:{})},zap=branded?undefined:hostZapHref(profile);
 // A self-declared profile Lightning address does not prove provisioning or the
 // 79/21 split. BW-19/BW-107 will supply a separately verified payment action.
 return <section className={styles.host} aria-labelledby="walk-host-heading"><h2 id="walk-host-heading">Hosted by</h2><NostrUser pubkey={pubkey} profile={profile} resolveProfile={false} showLightning={!branded} profileLink/>{zap?<a className={styles.zap} href={zap}>Say thanks with a zap ⚡</a>:<p className={styles.unavailable}>{branded?"City Lightning payments are not enabled yet.":"Zaps are not available for this host yet."}</p>}</section>;
}
