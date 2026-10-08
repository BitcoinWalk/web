"use client";

import {useEffect,useState} from "react";
import {nip19} from "nostr-tools";
import {verifyNip05,watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import CopyValue from "./copy-value";
import styles from "./nostr-user.module.css";

type Props={
 pubkey:string;
 profile?:PublicProfile;
 variant?:"compact"|"card";
 resolveProfile?:boolean;
 createdCities?:string[];
 editorCities?:string[];
 showLightning?:boolean;
 profileLink?:boolean;
};

export default function NostrUser({pubkey,profile:provided,variant="card",resolveProfile=true,createdCities=[],editorCities=[],showLightning=true,profileLink=false}:Props){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>(),[failed,setFailed]=useState<string>();
 const [verified,setVerified]=useState<{key:string;value:boolean}>();
 const profile=resolved?.pubkey===pubkey?resolved.profile:provided;
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,value)=>{if(key===pubkey)setResolved({pubkey:key,profile:value});}):()=>{},[pubkey,resolveProfile]);
 const verificationKey=profile?.nip05?`${pubkey}:${profile.nip05}`:"";
 useEffect(()=>{if(!profile?.nip05)return;let active=true;void verifyNip05(pubkey,profile.nip05).then(value=>{if(active)setVerified({key:verificationKey,value});});return()=>{active=false;};},[profile?.nip05,pubkey,verificationKey]);
 const verification:"absent"|"checking"|"verified"|"unverified"=!profile?.nip05?"absent":verified?.key!==verificationKey?"checking":verified.value?"verified":"unverified";
 const npub=/^[0-9a-f]{64}$/.test(pubkey)?nip19.npubEncode(pubkey):pubkey;
 return <article className={styles.user} data-variant={variant}>
  <div className={styles.identity}>
   {profile?.picture&&profile.picture!==failed
    // Public profile images are loaded by the browser and never proxied through BitcoinWalk.
    // eslint-disable-next-line @next/next/no-img-element
    ?<img src={profile.picture} alt="" width={variant==="compact"?48:64} height={variant==="compact"?48:64} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(profile.picture)} />
    :<span className={styles.avatar} aria-hidden="true">👤</span>}
   <div className={styles.details}>
    <div className={styles.nameLine}><strong className={styles.name}><CopyValue label="username" value={profile?.name??"Unnamed Nostr user"}/></strong>{profile?.nip05?<span className={styles.nip05}><CopyValue label="NIP-05" value={profile.nip05}/><span className={styles[verification]}>{verification==="verified"?"✓ verified":verification==="checking"?"checking…":"not verified"}</span></span>:<span className={styles.nip05Missing}>NIP-05 not provided</span>}</div>
    <dl>
     <div><dt>npub</dt><dd><CopyValue label="npub" value={npub}/></dd></div>
     {showLightning&&<div><dt>LNURL</dt><dd><CopyValue label="LNURL" value={profile?.lnurl}/></dd></div>}
    </dl>
    {profileLink&&<a href={`nostr:${npub}`}>Open Nostr profile</a>}
   </div>
  </div>
  {!!createdCities.length&&<p className={styles.cities}><strong>Created:</strong> {createdCities.join(", ")}</p>}
  {!!editorCities.length&&<p className={styles.cities}><strong>Can edit:</strong> {editorCities.join(", ")}</p>}
 </article>;
}
