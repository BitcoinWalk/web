"use client";

import {useEffect,useState} from "react";
import {nip19} from "nostr-tools";
import {verifyNip05,watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import styles from "./nostr-user.module.css";

type Props={
 pubkey:string;
 profile?:PublicProfile;
 variant?:"compact"|"card";
 resolveProfile?:boolean;
 createdCities?:string[];
 editorCities?:string[];
};

function CopyValue({label,value,onCopied}:{label:string;value?:string;onCopied:(label:string)=>void}){
 if(!value)return <span className={styles.missing}>Not provided</span>;
 return <span className={styles.copyValue}><span dir="auto">{value}</span><button className={styles.copy} type="button" title={`Copy ${label}`} aria-label={`Copy ${label}`} onClick={()=>void navigator.clipboard.writeText(value).then(()=>onCopied(label)).catch(()=>onCopied("Copy failed"))}>⧉</button></span>;
}

export default function NostrUser({pubkey,profile:provided,variant="card",resolveProfile=true,createdCities=[],editorCities=[]}:Props){
 const [resolved,setResolved]=useState<{pubkey:string;profile:PublicProfile}>(),[failed,setFailed]=useState<string>(),[copied,setCopied]=useState("");
 const [verified,setVerified]=useState<{key:string;value:boolean}>();
 const profile=resolved?.pubkey===pubkey?resolved.profile:provided;
 useEffect(()=>resolveProfile?watchPublicProfiles([pubkey],(key,value)=>{if(key===pubkey)setResolved({pubkey:key,profile:value});}):()=>{},[pubkey,resolveProfile]);
 const verificationKey=profile?.nip05?`${pubkey}:${profile.nip05}`:"";
 useEffect(()=>{if(!profile?.nip05)return;let active=true;void verifyNip05(pubkey,profile.nip05).then(value=>{if(active)setVerified({key:verificationKey,value});});return()=>{active=false;};},[profile?.nip05,pubkey,verificationKey]);
 const verification:"absent"|"checking"|"verified"|"unverified"=!profile?.nip05?"absent":verified?.key!==verificationKey?"checking":verified.value?"verified":"unverified";
 const npub=/^[0-9a-f]{64}$/.test(pubkey)?nip19.npubEncode(pubkey):pubkey;
 function copiedValue(label:string){setCopied(label==="Copy failed"?"Could not copy to clipboard.":`${label} copied.`);window.setTimeout(()=>setCopied(""),1800);}
 return <article className={styles.user} data-variant={variant}>
  <div className={styles.identity}>
   {profile?.picture&&profile.picture!==failed
    // Public profile images are loaded by the browser and never proxied through BitcoinWalk.
    // eslint-disable-next-line @next/next/no-img-element
    ?<img src={profile.picture} alt="" width={variant==="compact"?48:64} height={variant==="compact"?48:64} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(profile.picture)} />
    :<span className={styles.avatar} aria-hidden="true">👤</span>}
   <dl>
    <div><dt>Username</dt><dd><CopyValue label="username" value={profile?.name} onCopied={copiedValue}/></dd></div>
    <div><dt>npub</dt><dd><CopyValue label="npub" value={npub} onCopied={copiedValue}/></dd></div>
    <div><dt>NIP-05</dt><dd><CopyValue label="NIP-05" value={profile?.nip05} onCopied={copiedValue}/>{profile?.nip05&&<span className={styles[verification]}>{verification==="verified"?"✓ verified":verification==="checking"?"checking…":"not verified"}</span>}</dd></div>
    <div><dt>LNURL</dt><dd><CopyValue label="LNURL" value={profile?.lnurl} onCopied={copiedValue}/></dd></div>
   </dl>
  </div>
  {!!createdCities.length&&<p className={styles.cities}><strong>Created:</strong> {createdCities.join(", ")}</p>}
  {!!editorCities.length&&<p className={styles.cities}><strong>Can edit:</strong> {editorCities.join(", ")}</p>}
  <span className={styles.announcement} role="status" aria-live="polite">{copied}</span>
 </article>;
}
