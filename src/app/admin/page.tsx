"use client";
import Link from "next/link";
import DashboardUpcoming from "../../components/dashboard-upcoming";
import {useEffect,useState,useRef} from "react";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";
import {loadDashboardSummary,type DashboardSummary,type DashboardMetric} from "../../nostr/dashboard-data";
import {relayConfig} from "../../lib/relay-config";
import {getBrowserExtensionPubkey} from "../../nostr/signer";
import {dashboardNavigation} from "../../domain/dashboard";
export default function DashboardOverview(){
 const session=useDashboard();
 const [summary,setSummary]=useState<DashboardSummary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const lock=useRef(false);
 async function refresh(){
  if(lock.current)return;lock.current=true;setBusy(true);setSummary(null);setError("");
  try{if(await getBrowserExtensionPubkey()!==session.pubkey)throw new Error("Signer changed. Reconnect.");
   const data=await loadDashboardSummary(relayConfig.readRelays,session.pubkey,session.selectedCity);
   if(await getBrowserExtensionPubkey()!==session.pubkey)throw new Error("Signer changed. Reconnect.");
   setSummary(data);
  }catch(e){setError(e instanceof Error?e.message:"Dashboard data unavailable.");}finally{lock.current=false;setBusy(false);}
 }
 useDashboardAutoLoad(refresh);
 function metric(label:string,value:DashboardMetric,href:string){return <section key={label}><h2><Link href={href}>{label}: {value.value??"Unavailable"}</Link></h2>{value.error&&<p role="status">{value.error}</p>}</section>;}
 useEffect(()=>{if(/^#submission-[0-9a-f]{64}$/.test(window.location.hash))window.location.replace("/admin/cities?tab=requests"+window.location.hash);},[]);
 return <main><p>BitcoinWalk / dashboard</p><h1>Your BitcoinWalk dashboard</h1><p>Manage your cities, scheduled walks and hosting assignments in one place.</p>{!session.pubkey?<section><h2>Connect your signer</h2><p>Your Nostr identity determines the sections you can use. No private key is stored here.</p></section>:<><p>{session.role==="super-admin"?"You have super-admin controls across all cities.":session.role==="organizer"?"Your walk-publishing permissions and individual hosting assignments remain separate.":"You can view walks you have accepted as a host. Accepting a walk does not grant city editing access."}</p><button disabled={busy} onClick={refresh}>{busy?"Loading overview…":"Refresh overview"}</button>{error&&<p role="alert">{error}</p>}{summary&&<><p>Read started: {new Date(summary.checkedAt).toLocaleString()}. Counts reflect the selected city and current relay records.</p>{session.role!=="member"&&metric("Approved cities you manage",summary.cities,session.role==="super-admin"?"/admin/cities":"/admin/walks")}{session.role!=="member"&&metric("Current and upcoming walks",summary.walks,"/admin/walks")}{metric("Walks you are hosting",summary.hosting,"/admin/walks")}{session.role==="super-admin"&&metric("Pending submissions",summary.pending,"/admin/cities?tab=requests")}<DashboardUpcoming summary={summary} role={session.role}/></>}{dashboardNavigation(session.role).filter(item=>item.href!=="/admin").map(item=><section key={item.href}><h2><Link href={item.href}>{item.label} →</Link></h2></section>)}</>}<p>Each section loads its records from the relay. Unavailable data is not treated as zero pending work. All changes still require the appropriate signatures.</p></main>;
}
