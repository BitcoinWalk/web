"use client";
import {useEffect,useRef,useState} from "react";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import NostrUser from "./nostr-user";
import {organizerDirectory,type OrganizerDirectoryEntry} from "../domain/organizer-directory";
import {queryAuthorizations,queryCityRevisions,queryRelayEvents} from "../nostr/city-records";
import {relayConfig} from "../lib/relay-config";
import {getBrowserExtensionPubkey} from "../nostr/signer";
import {isSuperAdmin,SUPER_ADMIN_PUBKEY} from "../nostr/authority";
import styles from "./organizer-directory.module.css";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import {CITY_BRAND_KIND,resolveCityBrand} from "../nostr/city-brand";

export default function OrganizerDirectory(){
 const dashboard=useDashboard(),lock=useRef(false),[entries,setEntries]=useState<OrganizerDirectoryEntry[]>([]),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState("Connect the super-admin to browse hosts.");
 const profileKeys=entries.map(entry=>entry.pubkey).sort().join(",");
 useEffect(()=>watchPublicProfiles(profileKeys?profileKeys.split(","):[],(key,profile)=>setProfiles(current=>({...current,[key]:profile}))),[profileKeys]);
 useDashboardAutoLoad(load);
 async function load(){if(lock.current)return;lock.current=true;setBusy(true);setEntries([]);setMessage("Loading current hosts and city permissions…");try{const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor))throw new Error("Select the BitcoinWalk super-admin account in your extension.");const [grants,revisions,brandEvents]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryCityRevisions(relayConfig.readRelays),queryRelayEvents(relayConfig.readRelays,[CITY_BRAND_KIND],undefined,{authors:[SUPER_ADMIN_PUBKEY]})]);if(brandEvents.length>=500)throw new Error("City identity discovery reached its read limit. A complete host list cannot be confirmed.");if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed. Connect again.");const currentHosts=new Map<string,string>();for(const {grant} of grants){const history=brandEvents.filter(event=>event.tags.some(tag=>tag[0]==="i"&&tag[1]===grant.cityId)),current=resolveCityBrand(history,grant.cityId);if(current&&current.binding.action!=="revoke")currentHosts.set(grant.cityId,current.binding.brandPubkey);}const found=organizerDirectory(grants,revisions,dashboard.selectedCity,currentHosts),hosts=found.filter(entry=>entry.hostCities.length).length,editors=found.filter(entry=>entry.editorCities.length&&!entry.hostCities.length).length;setEntries(found);setMessage(`${hosts} current host account${hosts===1?"":"s"} and ${editors} additional editor account${editors===1?"":"s"} loaded${dashboard.selectedCity?" for the selected city":""}.`);}catch(error){setMessage(error instanceof Error?error.message:"Could not load hosts.");}finally{lock.current=false;setBusy(false);}}
 return <section><h2>Host directory</h2><p>Current city hosts and added city editors are derived from the latest signed city permissions. Original creators are historical provenance and are shown only when they still have explicit editor access. Public profile fields may be missing; only a verified NIP-05 badge confirms that the displayed identifier currently maps to the npub.</p><button disabled={busy} onClick={load}>{busy?"Loading hosts…":"Refresh hosts"}</button><p role="status">{message}</p>{!!entries.length&&<div className={styles.grid}>{entries.map(entry=><NostrUser key={entry.pubkey} pubkey={entry.pubkey} profile={profiles[entry.pubkey]} resolveProfile={false} hostCities={entry.hostCities} editorCities={entry.editorCities}/>)}</div>}</section>;
}
