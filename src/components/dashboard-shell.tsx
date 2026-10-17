"use client";
import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {dashboardAccess,dashboardMenuLabel,dashboardNavigation,dashboardProfileVisible} from "../domain/dashboard";
import {isSuperAdmin} from "../nostr/authority";
import {getBrowserExtensionPubkey,setDashboardAuthorizationCurrent,setDashboardSigningIdentity} from "../nostr/signer";
import {pendingCityRevisions,queryAuthorizations,queryDirectoryRecords} from "../nostr/city-records";
import {queryHostedWalks} from "../nostr/hosted-walks";
import {dashboardCities,latestDashboardGrants} from "../nostr/dashboard-data";
import {DashboardContext,emptyDashboardSession as blank} from "./dashboard-context";
export {useDashboard} from "./dashboard-context";
import {relayConfig} from "../lib/relay-config";
import NostrUser from "./nostr-user";
import OrganizerIdentity from "./organizer-identity";
import {activeSignerIdentity,disconnectSignerSession} from "../nostr/signer-session";
import styles from "./dashboard-shell.module.css";
import DashboardAccountMenu from "./dashboard-account-menu";
import {combinedPendingRequestCount,dashboardMenuRefreshEvent,pendingRequestCountEvent,pendingRequestCountFromEvent} from "./pending-request-count";
import {hostedWalkCount,loadDashboardMenuCounts,resolveDashboardMenuCounts,retainKnownDashboardMenuCounts,type DashboardMenuCounts} from "../nostr/dashboard-menu";
import {creatorSubmissions} from "../domain/creator-submissions";
import {cityOwnerPubkey} from "../domain/city";
import AdminDataStatus,{type AdminDataHealth} from "./admin-data-status";

const dashboardLogo="/brand/bitcoinwalk-horizontal-white.png";

export function DashboardBrand({open,onToggle}:{open:boolean;onToggle:()=>void}){
 return <div className={styles.brandRow}>
  <Link href="/admin" className={styles.brand} aria-label="BitcoinWalk dashboard"><Image src={dashboardLogo} width={2000} height={368} priority alt="BitcoinWalk"/></Link>
  <button type="button" className={styles.mobileBrand} onClick={onToggle} aria-label={open?"Close dashboard menu":"Open dashboard menu"} aria-expanded={open} aria-controls="dashboard-navigation">
   <span className={styles.mobileBrandViewport} data-open={open}><Image src={dashboardLogo} width={2000} height={368} priority alt="" aria-hidden="true"/></span>
  </button>
 </div>;
}

export default function DashboardShell({children}:{children:ReactNode}){
 const path=usePathname(),[session,setSession]=useState(blank),[error,setError]=useState(""),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[epoch,setEpoch]=useState(0),[pendingCounts,setPendingCounts]=useState<{cities:number|null;proActivations:number|null}>({cities:null,proActivations:null}),[menuCounts,setMenuCounts]=useState<DashboardMenuCounts>({cities:null,walks:null}),[dataHealth,setDataHealth]=useState<AdminDataHealth>({state:"loading",message:"Checking your permissions and city data…"});
 const generation=useRef(0),connecting=useRef(false);
 const clear=useCallback(()=>{setDashboardSigningIdentity(null);generation.current++;setSession(blank);setPendingCounts({cities:null,proActivations:null});setMenuCounts({cities:null,walks:null});setError("");setDataHealth({state:"loading",message:"Checking your permissions and city data…"});setEpoch(n=>n+1);},[]);
 const connect=useCallback(async(expectedPubkey?:string)=>{if(connecting.current)return;connecting.current=true;clear();const request=generation.current;setBusy(true);try{
 const pubkey=await getBrowserExtensionPubkey();if(!/^[0-9a-f]{64}$/.test(pubkey))throw new Error("Signer returned an invalid public key.");
 if(expectedPubkey&&pubkey!==expectedPubkey)throw new Error("Signer identity changed. Connect again.");
 const records=latestDashboardGrants(await queryAuthorizations(relayConfig.readRelays));
 const [directory,hosting]=await Promise.allSettled([queryDirectoryRecords(relayConfig.readRelays),queryHostedWalks(relayConfig.readRelays,pubkey)]);
 if(request!==generation.current)return;if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Connect again.");
 const cityCount=records.filter(r=>cityOwnerPubkey(r.grant)===pubkey||r.grant.editorPubkeys.includes(pubkey)).length;
 const cities=dashboardCities(pubkey,records,directory.status==="fulfilled"?directory.value.revisions:[],hosting.status==="fulfilled"?hosting.value:[]);
 const ownsCitySubmission=directory.status==="fulfilled"&&creatorSubmissions(pubkey,directory.value.revisions,directory.value.approvals).length>0;
 const role=isSuperAdmin(pubkey)?"super-admin":cityCount||ownsCitySubmission?"organizer":"member";
 const counts=directory.status==="fulfilled"?await resolveDashboardMenuCounts(relayConfig.readRelays,pubkey,role,records,directory.value,hosting.status==="fulfilled"?hosting.value:null):{cities:null,walks:role==="member"?hostedWalkCount(hosting.status==="fulfilled"?hosting.value:null):null};
 if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Connect again.");
 if(request!==generation.current)return;setDashboardSigningIdentity(pubkey);setSession({pubkey,role,cityCount,cities,selectedCity:"",grants:records,directory:directory.status==="fulfilled"?directory.value:null});
 setMenuCounts(counts);
 setPendingCounts({cities:role==="super-admin"&&directory.status==="fulfilled"?pendingCityRevisions(directory.value.revisions,directory.value.approvals).length:null,proActivations:null});
 const incomplete=directory.status==="rejected"||hosting.status==="rejected",checkedAt=new Date().toISOString();
 setDashboardAuthorizationCurrent(!incomplete);
 setDataHealth(incomplete?{state:"partial",message:"Available information is shown, but changes are paused until every required source can be checked. Retry before relying on a blank list.",checkedAt}:{state:"ready",message:"Permissions and city data were checked successfully.",checkedAt});
 setError("");
 }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:"Could not verify your identity.");}finally{connecting.current=false;setBusy(false);}},[clear]);
 const retryData=useCallback(async()=>{if(connecting.current||!session.pubkey)return;connecting.current=true;const request=++generation.current,pubkey=session.pubkey;setBusy(true);setDashboardAuthorizationCurrent(false);setDataHealth(current=>({state:"loading",message:"Refreshing permissions and city data without clearing this page…",checkedAt:current.checkedAt}));try{
  if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer identity changed. Reconnect to load the correct permissions.");
  const records=latestDashboardGrants(await queryAuthorizations(relayConfig.readRelays));
  const [directory,hosting]=await Promise.allSettled([queryDirectoryRecords(relayConfig.readRelays),queryHostedWalks(relayConfig.readRelays,pubkey)]);
  if(request!==generation.current)return;if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer identity changed. Reconnect to load the correct permissions.");
  const cityCount=records.filter(r=>cityOwnerPubkey(r.grant)===pubkey||r.grant.editorPubkeys.includes(pubkey)).length;
  const cities=dashboardCities(pubkey,records,directory.status==="fulfilled"?directory.value.revisions:[],hosting.status==="fulfilled"?hosting.value:[]);
  const ownsCitySubmission=directory.status==="fulfilled"&&creatorSubmissions(pubkey,directory.value.revisions,directory.value.approvals).length>0;
  const role=isSuperAdmin(pubkey)?"super-admin":cityCount||ownsCitySubmission?"organizer":"member";
  const counts=directory.status==="fulfilled"?await resolveDashboardMenuCounts(relayConfig.readRelays,pubkey,role,records,directory.value,hosting.status==="fulfilled"?hosting.value:null):{cities:null,walks:role==="member"?hostedWalkCount(hosting.status==="fulfilled"?hosting.value:null):null};
  if(request!==generation.current)return;if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer identity changed. Reconnect to load the correct permissions.");
  const incomplete=directory.status==="rejected"||hosting.status==="rejected";
  setSession(current=>incomplete?{...current,role,cityCount,grants:records}:{...current,pubkey,role,cityCount,cities,grants:records,directory:directory.value});
  if(!incomplete){setMenuCounts(current=>retainKnownDashboardMenuCounts(current,counts));setPendingCounts({cities:role==="super-admin"?pendingCityRevisions(directory.value.revisions,directory.value.approvals).length:null,proActivations:null});}
  setDashboardAuthorizationCurrent(!incomplete);
  const checkedAt=new Date().toISOString();setDataHealth(incomplete?{state:"partial",message:"The last checked city information remains visible, but changes are paused until every required source can be checked.",checkedAt}:{state:"ready",message:"Permissions and city data were checked successfully.",checkedAt});
 }catch(e){if(request===generation.current){setDashboardAuthorizationCurrent(false);setDataHealth(current=>({state:"stale",message:e instanceof Error?`${e.message} Existing information remains visible, but changes are paused until Retry succeeds.`:"The latest data could not be checked. Existing information remains visible, but changes are paused until Retry succeeds.",checkedAt:current.checkedAt}));}}finally{connecting.current=false;setBusy(false);}},[session.pubkey]);
 const accountChanged=useCallback((pubkey:string|null)=>{if(pubkey)void connect(pubkey);else clear();},[clear,connect]);
 async function disconnect(){await disconnectSignerSession();clear();}
 useEffect(()=>{const pubkey=activeSignerIdentity();if(pubkey)queueMicrotask(()=>void connect(pubkey));},[connect]);
 useEffect(()=>{if(!session.pubkey)return;let alive=true;const invalidate=async(message:string)=>{await disconnectSignerSession();if(alive){clear();setError(message);}};const check=async()=>{try{const key=await getBrowserExtensionPubkey();if(alive&&key!==session.pubkey)await invalidate("Signer identity changed. Reconnect to reload your permissions.");}catch{if(alive)await invalidate("Signer unavailable. Reconnect before continuing.");}};window.addEventListener("focus",check);const timer=setInterval(check,15000);return()=>{alive=false;window.removeEventListener("focus",check);clearInterval(timer);};},[clear,session.pubkey]);
 useEffect(()=>()=>setDashboardSigningIdentity(null),[]);
 useEffect(()=>{const update=(event:Event)=>{const detail=pendingRequestCountFromEvent(event);if(!detail)return;setPendingCounts(current=>detail.source==="cities"?{...current,cities:detail.count}:{...current,proActivations:detail.count});};window.addEventListener(pendingRequestCountEvent,update);return()=>window.removeEventListener(pendingRequestCountEvent,update);},[]);
 useEffect(()=>{const refresh=()=>{if(session.pubkey)void loadDashboardMenuCounts(relayConfig.readRelays,session.pubkey,session.role).then(next=>setMenuCounts(current=>retainKnownDashboardMenuCounts(current,next)));};window.addEventListener(dashboardMenuRefreshEvent,refresh);return()=>window.removeEventListener(dashboardMenuRefreshEvent,refresh);},[session.pubkey,session.role]);
 if(!session.pubkey)return <DashboardContext.Provider value={session}><main className={styles.entry} data-hide-site-footer><OrganizerIdentity disabled={busy} heading="Your account" intro="Create a new Nostr identity, or connect one you already use." onIdentityChange={accountChanged}/>{error&&<p role="alert">{error}</p>}</main></DashboardContext.Provider>;
 const allowed=dashboardAccess(path,session.role)||path==="/admin/calendar";
 const status=busy?"connecting":dataHealth.state==="failed"||dataHealth.state==="stale"?"error":session.pubkey?"connected":"disconnected";
 const pendingCount=combinedPendingRequestCount(pendingCounts);
 const navigation=dashboardNavigation(session.role,{hostedWalks:(menuCounts.walks??0)>0});
 return <DashboardContext.Provider value={session}><div className={styles.shell}><aside className={styles.sidebar}><DashboardBrand open={open} onToggle={()=>setOpen(value=>!value)}/><nav id="dashboard-navigation" className={styles.nav} data-open={open} aria-label="Dashboard">{navigation.map(item=><Link key={item.href} className={item.href==="/admin/guide"?styles.subnav:undefined} href={item.href} aria-current={path===item.href||item.href==="/admin/sponsor"&&path.startsWith("/admin/sponsors")||item.href.startsWith("/admin/monitoring/")&&path.startsWith("/admin/monitoring/")?"page":undefined} onClick={()=>setOpen(false)}>{dashboardMenuLabel(item.href,item.label,session.role,{...menuCounts,requests:pendingCount})}</Link>)}</nav></aside><div className={styles.content} data-chat={path==="/admin/chat"||undefined}><DashboardAccountMenu pubkey={session.pubkey} role={session.role} walkCount={menuCounts.walks} onDisconnect={()=>void disconnect()}/>{dashboardProfileVisible(path)&&<header className={styles.topbar}><div className={styles.welcome}><div className={styles.headline}><strong>Welcome to your dashboard!</strong><div className={styles.connection} role="status" aria-live="polite"><span className={styles.statusDot} data-status={status} role="img" aria-label={`${status} status`}/></div></div><NostrUser pubkey={session.pubkey} variant="compact"/></div></header>}<div className={styles.dataHealth}><AdminDataStatus health={dataHealth} busy={busy} onRetry={()=>void retryData()} scope="Dashboard connection"/></div><div className={styles.body} data-chat={path==="/admin/chat"||undefined} key={`${epoch}:${session.selectedCity}`}>{allowed?children:<main><h1>Section unavailable</h1><p>This section is not available for the connected identity. Choose a section from the menu.</p></main>}</div></div></div></DashboardContext.Provider>;
}
