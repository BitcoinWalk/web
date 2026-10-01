"use client";
import Link from "next/link";
import DashboardUpcoming from "../../components/dashboard-upcoming";
import {useEffect,useState,useRef} from "react";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";
import {loadDashboardSummary,type DashboardSummary,type DashboardMetric} from "../../nostr/dashboard-data";
import {relayConfig} from "../../lib/relay-config";
import {getBrowserExtensionPubkey} from "../../nostr/signer";
import {dashboardNavigation} from "../../domain/dashboard";
import {creatorSubmissions} from "../../domain/creator-submissions";
import {takeRegistrationHandoff,type RegistrationHandoff} from "../../domain/registration-handoff";
export default function DashboardOverview(){
 const session=useDashboard();
 const [summary,setSummary]=useState<DashboardSummary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [handoff,setHandoff]=useState<RegistrationHandoff|null>(null),[submittedCity,setSubmittedCity]=useState("");
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
 useEffect(()=>{if(/^#submission-[0-9a-f]{64}$/.test(window.location.hash)){window.location.replace("/admin/requests"+window.location.hash);return;}queueMicrotask(()=>{setHandoff(takeRegistrationHandoff());setSubmittedCity(new URLSearchParams(window.location.search).get("submitted")??"");});},[]);
 const submissions=session.directory?creatorSubmissions(session.pubkey,session.directory.revisions,session.directory.approvals):[],activeSubmissions=submissions.filter(item=>item.status!=="archived"),archivedSubmissions=submissions.filter(item=>item.status==="archived");
 const statusLabel={"awaiting-approval":"Awaiting approval",approved:"Approved","needs-changes":"Needs changes",archived:"Archived"} as const;
 return <main><p>BitcoinWalk / dashboard</p><h1>Your BitcoinWalk dashboard</h1><p>Manage your cities, scheduled walks and hosting assignments in one place.</p>{handoff&&<section role="status"><h2>{handoff.paymentVerified?"Payment received":"City submitted"}</h2><p>{handoff.paymentVerified?`Your Pro payment for BitcoinWalk in ${handoff.cityName} is verified. The city is awaiting approval.`:`BitcoinWalk in ${handoff.cityName} was submitted successfully and is awaiting approval.`}</p></section>}<section><h2>Your city submissions</h2>{activeSubmissions.length?<div>{activeSubmissions.map(item=><article key={item.cityId} id={`city-submission-${item.cityId}`} aria-current={item.cityId===submittedCity?"true":undefined}><h3>{item.cityName}</h3><p><strong>{item.tier==="paid"?"Pro requested":"Basic"}</strong> · {statusLabel[item.status]}</p>{item.status==="approved"&&<p><Link href={`/${item.slug}`}>View city page →</Link></p>}{item.status==="needs-changes"&&<p>Review the administrator feedback, update the city details, and submit the revision again.</p>}</article>)}</div>:<p>No active city submissions were found for this identity. <Link href="/start">Start a BitcoinWalk →</Link></p>}</section>{!!archivedSubmissions.length&&<section><h2>Archived cities</h2><p>Archived cities are read-only and hidden from public and active organizer views. Contact BitcoinWalk to request restoration.</p>{archivedSubmissions.map(item=><article key={item.cityId}><h3>{item.cityName}</h3><p><strong>{item.tier==="paid"?"Pro requested":"Basic"}</strong> · Archived</p></article>)}</section>}<p>{session.role==="super-admin"?"You have super-admin controls across all cities.":session.role==="organizer"?"Your walk-publishing permissions and individual hosting assignments remain separate.":"A submitted city appears here before approval. Organizer tools unlock when the city is approved."}</p><button disabled={busy} onClick={refresh}>{busy?"Loading overview…":"Refresh overview"}</button>{error&&<p role="alert">{error}</p>}{summary&&<><p>Read started: {new Date(summary.checkedAt).toLocaleString()}. Counts reflect the selected city and current relay records.</p>{session.role!=="member"&&metric("Approved cities you manage",summary.cities,session.role==="super-admin"?"/admin/cities":"/admin/walks")}{session.role!=="member"&&metric("Current and upcoming walks",summary.walks,"/admin/walks")}{metric("Walks you are hosting",summary.hosting,"/admin/walks")}{session.role==="super-admin"&&metric("Pending submissions",summary.pending,"/admin/requests")}<DashboardUpcoming summary={summary} role={session.role}/></>}{dashboardNavigation(session.role).filter(item=>item.href!=="/admin").map(item=><section key={item.href}><h2><Link href={item.href}>{item.label} →</Link></h2></section>)}<p>Each section loads its records from the relay. Unavailable data is not treated as zero pending work. All changes still require the appropriate signatures.</p></main>;
}
