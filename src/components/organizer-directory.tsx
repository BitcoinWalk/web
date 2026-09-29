"use client";
import {useEffect,useRef,useState} from "react";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import NostrUser from "./nostr-user";
import {organizerDirectory,type OrganizerDirectoryEntry} from "../domain/organizer-directory";
import {queryAuthorizations,queryCityRevisions} from "../nostr/city-records";
import {relayConfig} from "../lib/relay-config";
import {getBrowserExtensionPubkey} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import styles from "./organizer-directory.module.css";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";

export default function OrganizerDirectory(){
 const dashboard=useDashboard(),lock=useRef(false),[entries,setEntries]=useState<OrganizerDirectoryEntry[]>([]),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState("Connect the super-admin to browse organizers.");
 const profileKeys=entries.map(entry=>entry.pubkey).sort().join(",");
 useEffect(()=>watchPublicProfiles(profileKeys?profileKeys.split(","):[],(key,profile)=>setProfiles(current=>({...current,[key]:profile}))),[profileKeys]);
 useDashboardAutoLoad(load);
 async function load(){if(lock.current)return;lock.current=true;setBusy(true);setEntries([]);setMessage("Loading organizers and city permissions…");try{const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor))throw new Error("Select the BitcoinWalk super-admin account in your extension.");const [grants,revisions]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryCityRevisions(relayConfig.readRelays)]);if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed. Connect again.");const found=organizerDirectory(grants,revisions,dashboard.selectedCity);setEntries(found);setMessage(`${found.length} organizer${found.length===1?"":"s"} loaded${dashboard.selectedCity?" for the selected city":""}.`);}catch(error){setMessage(error instanceof Error?error.message:"Could not load organizers.");}finally{lock.current=false;setBusy(false);}}
 return <section><h2>Organizer directory</h2><p>Creators and added city editors are derived from the latest signed city permissions. Public profile fields may be missing; only a verified NIP-05 badge confirms that the displayed identifier currently maps to the npub.</p><button disabled={busy} onClick={load}>{busy?"Loading organizers…":"Refresh organizers"}</button><p role="status">{message}</p>{!!entries.length&&<div className={styles.grid}>{entries.map(entry=><NostrUser key={entry.pubkey} pubkey={entry.pubkey} profile={profiles[entry.pubkey]} resolveProfile={false} createdCities={entry.createdCities} editorCities={entry.editorCities}/>)}</div>}</section>;
}
