"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {dashboardAccess,dashboardMenuLabel,dashboardNavigation} from "../domain/dashboard";
import {isSuperAdmin} from "../nostr/authority";
import {getBrowserExtensionPubkey,setDashboardSigningIdentity} from "../nostr/signer";
import {pendingCityRevisions,queryAuthorizations,queryDirectoryRecords} from "../nostr/city-records";
import {queryHostedWalks} from "../nostr/hosted-walks";
import {dashboardCities,latestDashboardGrants} from "../nostr/dashboard-data";
import {DashboardContext,emptyDashboardSession as blank} from "./dashboard-context";
export {useDashboard} from "./dashboard-context";
import {relayConfig} from "../lib/relay-config";
import NostrUser from "./nostr-user";
import styles from "./dashboard-shell.module.css";
import {dashboardMenuRefreshEvent,pendingRequestCountEvent,pendingRequestCountFromEvent} from "./pending-request-count";
import {loadDashboardMenuCounts,resolveDashboardMenuCounts,type DashboardMenuCounts} from "../nostr/dashboard-menu";
export default function DashboardShell({children}:{children:ReactNode}){
 const path=usePathname(),[session,setSession]=useState(blank),[error,setError]=useState(""),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[epoch,setEpoch]=useState(0),[pendingCount,setPendingCount]=useState<number|null>(null),[menuCounts,setMenuCounts]=useState<DashboardMenuCounts>({cities:null,walks:null});
 const generation=useRef(0),connecting=useRef(false);
 function clear(){setDashboardSigningIdentity(null);generation.current++;setSession(blank);setPendingCount(null);setMenuCounts({cities:null,walks:null});setError("");setEpoch(n=>n+1);}
 async function connect(){if(connecting.current)return;connecting.current=true;clear();const request=generation.current;setBusy(true);try{
 const pubkey=await getBrowserExtensionPubkey();if(!/^[0-9a-f]{64}$/.test(pubkey))throw new Error("Signer returned an invalid public key.");
 const records=latestDashboardGrants(await queryAuthorizations(relayConfig.readRelays));
 const [directory,hosting]=await Promise.allSettled([queryDirectoryRecords(relayConfig.readRelays),queryHostedWalks(relayConfig.readRelays,pubkey)]);
 if(request!==generation.current)return;if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Connect again.");
 const cityCount=records.filter(r=>r.grant.creatorPubkey===pubkey||r.grant.editorPubkeys.includes(pubkey)).length;
 const cities=dashboardCities(pubkey,records,directory.status==="fulfilled"?directory.value.revisions:[],hosting.status==="fulfilled"?hosting.value:[]);
 const role=isSuperAdmin(pubkey)?"super-admin":cityCount?"organizer":"member";
 const counts=directory.status==="fulfilled"?await resolveDashboardMenuCounts(relayConfig.readRelays,pubkey,role,records,directory.value,hosting.status==="fulfilled"?hosting.value:null):{cities:null,walks:null};
 if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Connect again.");
 if(request!==generation.current)return;setDashboardSigningIdentity(pubkey);setSession({pubkey,role,cityCount,cities,selectedCity:"",grants:records,directory:directory.status==="fulfilled"?directory.value:null});
 setMenuCounts(counts);
 setPendingCount(role==="super-admin"&&directory.status==="fulfilled"?pendingCityRevisions(directory.value.revisions,directory.value.approvals).length:null);
 setError(directory.status==="rejected"||hosting.status==="rejected"?"City discovery is incomplete. Disconnect and reconnect to retry; missing cities do not mean missing permissions.":"");
 }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:"Could not verify your identity.");}finally{connecting.current=false;setBusy(false);}}
 useEffect(()=>{if(!session.pubkey)return;let alive=true;const check=async()=>{try{const key=await getBrowserExtensionPubkey();if(alive&&key!==session.pubkey){clear();setError("Signer identity changed. Reconnect to reload your permissions.");}}catch{if(alive){clear();setError("Signer unavailable. Reconnect before continuing.");}}};window.addEventListener("focus",check);const timer=setInterval(check,15000);return()=>{alive=false;window.removeEventListener("focus",check);clearInterval(timer);};},[session.pubkey]);
 useEffect(()=>()=>setDashboardSigningIdentity(null),[]);
 useEffect(()=>{const update=(event:Event)=>{const count=pendingRequestCountFromEvent(event);if(count!==null)setPendingCount(count);};window.addEventListener(pendingRequestCountEvent,update);return()=>window.removeEventListener(pendingRequestCountEvent,update);},[]);
 useEffect(()=>{const refresh=()=>{if(session.pubkey)void loadDashboardMenuCounts(relayConfig.readRelays,session.pubkey,session.role).then(setMenuCounts);};window.addEventListener(dashboardMenuRefreshEvent,refresh);return()=>window.removeEventListener(dashboardMenuRefreshEvent,refresh);},[session.pubkey,session.role]);
 const allowed=dashboardAccess(path,session.role)||path==="/admin/calendar";
 const status=busy?"connecting":error?"error":session.pubkey?"connected":"disconnected";
 return <DashboardContext.Provider value={session}><div className={styles.shell}><aside className={styles.sidebar}><Link href="/admin" className={styles.brand}>₿ BitcoinWalk</Link><button className={styles.menu} onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="dashboard-navigation">Menu</button><nav id="dashboard-navigation" className={styles.nav} data-open={open} aria-label="Dashboard">{dashboardNavigation(session.role).map(item=><Link key={item.href} href={item.href} aria-current={path===item.href?"page":undefined} onClick={()=>setOpen(false)}>{dashboardMenuLabel(item.href,item.label,session.role,{...menuCounts,requests:pendingCount})}</Link>)}</nav></aside><div className={styles.content}><header className={styles.topbar}><div className={styles.welcome}><div className={styles.headline}><strong>Welcome to your dashboard!</strong><div className={styles.actions}>{!session.pubkey&&<button disabled={busy} onClick={connect}>{busy?"Connecting…":"Connect signer"}</button>}{session.pubkey&&<button onClick={clear}>Disconnect</button>}</div><div className={styles.connection} role="status" aria-live="polite"><span className={styles.statusDot} data-status={status} role="img" aria-label={`${status} status`}/>{error&&<span role="alert">{error}</span>}</div></div>{session.pubkey&&<NostrUser pubkey={session.pubkey} variant="compact"/>}</div></header><div className={styles.body} key={`${epoch}:${session.selectedCity}`}>{allowed?children:<main><h1>{session.pubkey?"Section unavailable":"Connect to continue"}</h1><p>{session.pubkey?"This section is not available for the connected identity. Choose a section from the menu.":"Use Connect signer above. Super-admin tools appear only for the BitcoinWalk super-admin."}</p></main>}</div></div></div></DashboardContext.Provider>;
}
