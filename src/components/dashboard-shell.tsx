"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {dashboardAccess,dashboardNavigation} from "../domain/dashboard";
import {isSuperAdmin} from "../nostr/authority";
import {getBrowserExtensionPubkey,setDashboardSigningIdentity} from "../nostr/signer";
import {queryAuthorizations,queryDirectoryRecords} from "../nostr/city-records";
import {queryHostedWalks} from "../nostr/hosted-walks";
import {dashboardCities,latestDashboardGrants} from "../nostr/dashboard-data";
import {DashboardContext,emptyDashboardSession as blank} from "./dashboard-context";
export {useDashboard} from "./dashboard-context";
import {relayConfig} from "../lib/relay-config";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import EditorIdentity from "./editor-identity";
import styles from "./dashboard-shell.module.css";
export default function DashboardShell({children}:{children:ReactNode}){
 const path=usePathname(),[session,setSession]=useState(blank),[error,setError]=useState(""),[profile,setProfile]=useState<PublicProfile>(),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[epoch,setEpoch]=useState(0);
 const generation=useRef(0),connecting=useRef(false);
 function clear(){setDashboardSigningIdentity(null);generation.current++;setSession(blank);setProfile(undefined);setError("");setEpoch(n=>n+1);}
 async function connect(){if(connecting.current)return;connecting.current=true;clear();const request=generation.current;setBusy(true);try{
 const pubkey=await getBrowserExtensionPubkey();if(!/^[0-9a-f]{64}$/.test(pubkey))throw new Error("Signer returned an invalid public key.");
 const records=latestDashboardGrants(await queryAuthorizations(relayConfig.readRelays));
 const [directory,hosting]=await Promise.allSettled([queryDirectoryRecords(relayConfig.readRelays),queryHostedWalks(relayConfig.readRelays,pubkey)]);
 if(request!==generation.current)return;if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Connect again.");
 const cityCount=records.filter(r=>r.grant.creatorPubkey===pubkey||r.grant.editorPubkeys.includes(pubkey)).length;
 const cities=dashboardCities(pubkey,records,directory.status==="fulfilled"?directory.value.revisions:[],hosting.status==="fulfilled"?hosting.value:[]);
 if(request!==generation.current)return;setDashboardSigningIdentity(pubkey);setSession({pubkey,role:isSuperAdmin(pubkey)?"super-admin":cityCount?"organizer":"member",cityCount,cities,selectedCity:""});
 setError(directory.status==="rejected"||hosting.status==="rejected"?"City discovery is incomplete. Disconnect and reconnect to retry; missing cities do not mean missing permissions.":"");
 }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:"Could not verify your identity.");}finally{connecting.current=false;setBusy(false);}}
 useEffect(()=>{if(!session.pubkey)return;return watchPublicProfiles([session.pubkey],(key,value)=>{if(key===session.pubkey)setProfile(value);});},[session.pubkey]);
 useEffect(()=>{if(!session.pubkey)return;let alive=true;const check=async()=>{try{const key=await getBrowserExtensionPubkey();if(alive&&key!==session.pubkey){clear();setError("Signer identity changed. Reconnect to reload your permissions.");}}catch{if(alive){clear();setError("Signer unavailable. Reconnect before continuing.");}}};window.addEventListener("focus",check);const timer=setInterval(check,15000);return()=>{alive=false;window.removeEventListener("focus",check);clearInterval(timer);};},[session.pubkey]);
 useEffect(()=>()=>setDashboardSigningIdentity(null),[]);
 const allowed=dashboardAccess(path,session.role)||path==="/admin/calendar";
 const status=busy?"connecting":error?"error":session.pubkey?"connected":"disconnected";
 return <DashboardContext.Provider value={session}><div className={styles.shell}><aside className={styles.sidebar}><Link href="/admin" className={styles.brand}>₿ BitcoinWalk</Link><button className={styles.menu} onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="dashboard-navigation">Menu</button><nav id="dashboard-navigation" className={styles.nav} data-open={open} aria-label="Dashboard">{dashboardNavigation(session.role).map(item=><Link key={item.href} href={item.href} aria-current={path===item.href?"page":undefined} onClick={()=>setOpen(false)}>{item.label}</Link>)}</nav></aside><div className={styles.content}><header className={styles.topbar}><div className={styles.welcome}><strong>Welcome to your dashboard!</strong>{session.pubkey&&<EditorIdentity pubkey={session.pubkey} profile={profile}/>}</div><div className={styles.actions}>{!session.pubkey&&<button disabled={busy} onClick={connect}>{busy?"Connecting…":"Connect signer"}</button>}{session.pubkey&&<button onClick={clear}>Disconnect</button>}{session.role==="super-admin"&&<label>City <select value={session.selectedCity} onChange={event=>{const selectedCity=event.target.value;if(path!=="/admin"&&!window.confirm("Changing city clears open forms and unsent changes. Already-submitted changes may still complete. Continue?"))return;setDashboardSigningIdentity(session.pubkey);setSession({...session,selectedCity});}}><option value="">All available cities</option>{session.cities.map(city=><option key={city.id} value={city.id}>{city.name}</option>)}</select></label>}</div><div className={styles.connection} role="status" aria-live="polite"><span className={styles.statusDot} data-status={status} role="img" aria-label={`${status} status`}/>{error&&<span role="alert">{error}</span>}</div></header><div className={styles.body} key={`${epoch}:${session.selectedCity}`}>{allowed?children:<main><h1>{session.pubkey?"Section unavailable":"Connect to continue"}</h1><p>{session.pubkey?"This section is not available for the connected identity. Choose a section from the menu.":"Use Connect signer above. Super-admin tools appear only for the BitcoinWalk super-admin."}</p></main>}</div></div></div></DashboardContext.Provider>;
}
