"use client";

import {useEffect,useState} from "react";
import {nip19} from "nostr-tools";
import {retryPublicProfile,verifyNip05,watchPublicProfiles,type PublicProfile,type ProfileLoadState} from "../nostr/profiles";
import CopyValue from "./copy-value";
import styles from "./nostr-user.module.css";

type Props={
 pubkey:string;
 profile?:PublicProfile;
 variant?:"compact"|"card";
 resolveProfile?:boolean;
 hostCities?:string[];
 editorCities?:string[];
 showLightning?:boolean;
 profileLink?:boolean;
 copyValues?:boolean;
};

export default function NostrUser({pubkey,profile:provided,variant="card",resolveProfile=true,hostCities=[],editorCities=[],showLightning=true,profileLink=false,copyValues=true}:Props){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>(),[failed,setFailed]=useState<string>();
 const [verified,setVerified]=useState<{key:string;value:boolean}>();
 const [load,setLoad]=useState<{key:string;state:ProfileLoadState}>();
 const profile=resolved?.pubkey===pubkey?resolved.profile:provided;
 const pending=resolveProfile&&!profile;
 const unavailable=load?.key===pubkey&&load.state==="unavailable";
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,value)=>{if(key===pubkey)setResolved({pubkey:key,profile:value});},(key,state)=>setLoad({key,state})):()=>{},[pubkey,resolveProfile]);
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
    :<span className={styles.avatar} aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span>}
   <div className={styles.details}>
    <div className={styles.nameLine}><strong className={styles.name}>{pending?<span role="status">{unavailable?"Profile unavailable":"Loading profile…"}</span>:copyValues?<CopyValue label="username" value={profile?.name??"Unnamed Nostr user"}/>:<span>{profile?.name??"Unnamed Nostr user"}</span>}</strong>{profile?.nip05?<span className={styles.nip05}>{copyValues?<CopyValue label="NIP-05" value={profile.nip05}/>:<span>{profile.nip05}</span>}<span className={styles[verification]}>{verification==="verified"?"✓ verified":verification==="checking"?"checking…":"not verified"}</span></span>:!pending&&<span className={styles.nip05Missing}>NIP-05 not provided</span>}{pending&&unavailable&&<button type="button" onClick={()=>retryPublicProfile(pubkey)}>Retry profile</button>}</div>
    <dl>
     <div><dt>npub</dt><dd>{copyValues?<CopyValue label="npub" value={npub}/>:<span title={npub}>{npub.slice(0,16)}…{npub.slice(-8)}</span>}</dd></div>
     {showLightning&&<div><dt>LNURL</dt><dd>{pending?(unavailable?"Unavailable":"Loading…"):copyValues?<CopyValue label="LNURL" value={profile?.lnurl}/>:<span>{profile?.lnurl??"Not provided"}</span>}</dd></div>}
    </dl>
    {profileLink&&<a href={`nostr:${npub}`}>Open Nostr profile</a>}
   </div>
  </div>
  {!!hostCities.length&&<p className={styles.cities}><strong>Hosts:</strong> {hostCities.join(", ")}</p>}
  {!!editorCities.length&&<p className={styles.cities}><strong>Can edit:</strong> {editorCities.join(", ")}</p>}
 </article>;
}
