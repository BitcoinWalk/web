"use client";

import {nip19} from "nostr-tools";
import {useEffect,useState} from "react";
import type {DashboardRole} from "../domain/dashboard";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import styles from "./dashboard-account-menu.module.css";

function roleLabel(role:DashboardRole){return role==="super-admin"?"Super-admin":role==="organizer"?"Host":"Participant";}

export default function DashboardAccountMenu({pubkey,role,walkCount,onDisconnect}:{pubkey:string;role:DashboardRole;walkCount:number|null;onDisconnect:()=>void}){
 const [profile,setProfile]=useState<PublicProfile>(),[failed,setFailed]=useState("");
 useEffect(()=>watchPublicProfiles([pubkey],(key,value)=>{if(key===pubkey)setProfile(value);}),[pubkey]);
 const npub=nip19.npubEncode(pubkey),label=profile?.name??`${npub.slice(0,12)}…${npub.slice(-6)}`,picture=profile?.picture&&profile.picture!==failed?profile.picture:null;
 return <details className={styles.account}>
  <summary aria-label={`Account menu for ${label}`} title={`Logged in as ${label}`}>
   {picture
    // Public profile images are loaded directly by the browser.
    // eslint-disable-next-line @next/next/no-img-element
    ?<img src={picture} alt="" width="44" height="44" referrerPolicy="no-referrer" onError={()=>setFailed(picture)}/>
    :<span aria-hidden="true">👤</span>}
  </summary>
  <div className={styles.menu}>
   <strong>{label}</strong>
   <small>{npub.slice(0,16)}…{npub.slice(-8)}</small>
   <a href={`nostr:${npub}`}>Profile</a>
   {profile?.lnurl?<a href={`lightning:${profile.lnurl}`}>Wallet</a>:<span>Wallet <small>Not added</small></span>}
   <span>Badge <small>{roleLabel(role)}</small></span>
   <span>Walk count <small>{walkCount??"Loading…"}</small></span>
   <button type="button" onClick={onDisconnect}>Disconnect</button>
  </div>
 </details>;
}
