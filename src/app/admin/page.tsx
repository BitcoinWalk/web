"use client";
import Image from "next/image";
import Link from "next/link";
import {QRCodeSVG} from "qrcode.react";
import DashboardUpcoming from "../../components/dashboard-upcoming";
import {useEffect,useState,useRef} from "react";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";
import {loadDashboardSummary,type DashboardSummary,type DashboardMetric} from "../../nostr/dashboard-data";
import {relayConfig} from "../../lib/relay-config";
import {getBrowserExtensionPubkey} from "../../nostr/signer";
import {dashboardHomeActions,dashboardHomeCopy} from "../../domain/dashboard";
import {creatorSubmissions} from "../../domain/creator-submissions";
import {takeRegistrationHandoff,type RegistrationHandoff} from "../../domain/registration-handoff";
import styles from "./overview.module.css";
import AdminDataStatus,{type AdminDataHealth} from "../../components/admin-data-status";
import OrganizerProNextAction from "../../components/organizer-pro-next-action";
const WALKIE_TALKIE_DOWNLOAD_URL="https://bitcoinwalk.org/app";
export default function DashboardOverview(){
 const session=useDashboard();
 const [summary,setSummary]=useState<DashboardSummary|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [handoff,setHandoff]=useState<RegistrationHandoff|null>(null),[submittedCity,setSubmittedCity]=useState("");
 const lock=useRef(false);
 async function refresh(){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");
  try{if(await getBrowserExtensionPubkey()!==session.pubkey)throw new Error("Signer changed. Reconnect.");
   const data=await loadDashboardSummary(relayConfig.readRelays,session.pubkey,session.selectedCity);
   if(await getBrowserExtensionPubkey()!==session.pubkey)throw new Error("Signer changed. Reconnect.");
   setSummary(data);
  }catch(e){setError(e instanceof Error?e.message:"Dashboard data unavailable.");}finally{lock.current=false;setBusy(false);}
 }
 useDashboardAutoLoad(refresh);
 const summaryHealth:AdminDataHealth=busy?{state:"loading",message:summary?"Refreshing the summary while keeping the current figures visible.":"Loading your dashboard summary…",checkedAt:summary?.checkedAt}:error?{state:summary?"stale":"failed",message:summary?`${error} The last checked summary remains visible.`:error,checkedAt:summary?.checkedAt}:summary?Object.values({cities:summary.cities,walks:summary.walks,hosting:summary.hosting,pending:summary.pending}).some(metric=>metric.error)?{state:"partial",message:"Available figures are shown. Unavailable totals are not treated as zero.",checkedAt:summary.checkedAt}:{state:"ready",message:"This summary was checked successfully.",checkedAt:summary.checkedAt}:{state:"loading",message:"Loading your dashboard summary…"};
 function metric(label:string,value:DashboardMetric,href:string){return <article className={styles.metric} key={label}><p>{label}</p><strong>{value.value??"Unavailable"}</strong><p><Link href={href}>Open details →</Link></p>{value.error&&<p role="status">{value.error}</p>}</article>;}
 useEffect(()=>{if(/^#submission-[0-9a-f]{64}$/.test(window.location.hash)){window.location.replace("/admin/requests"+window.location.hash);return;}queueMicrotask(()=>{setHandoff(takeRegistrationHandoff());setSubmittedCity(new URLSearchParams(window.location.search).get("submitted")??"");});},[]);
 const submissions=session.directory?creatorSubmissions(session.pubkey,session.directory.revisions,session.directory.approvals):[],activeSubmissions=submissions.filter(item=>item.status!=="archived"),archivedSubmissions=submissions.filter(item=>item.status==="archived");
 const statusLabel={"awaiting-approval":"Awaiting approval",approved:"Approved","needs-changes":"Awaits change",rejected:"Rejected",archived:"Archived"} as const;
 const capabilities={hostedWalks:session.role==="member"&&session.cities.length>0},copy=dashboardHomeCopy(session.role),actions=dashboardHomeActions(session.role,capabilities),showSubmissions=activeSubmissions.length>0||archivedSubmissions.length>0;
 return <main className={styles.overview}>
  <p className={styles.eyebrow}>BitcoinWalk dashboard</p><h1>{copy.title}</h1><p className={styles.intro}>{copy.intro}</p>
  {session.role==="organizer"&&<OrganizerProNextAction/>}
  <section className={styles.walkieDownload} aria-labelledby="walkie-download-title">
   <Image src="/brand/walkie-talkie-zapstore-icon.png" width={56} height={56} alt=""/>
   <div className={styles.walkieCopy}><p>Companion app</p><h2 id="walkie-download-title">Walkie Talkie</h2><p>Take your city, Guide and global chats with you on Android.</p></div>
   <div className={styles.walkieActions}><div className={styles.walkieQr}><QRCodeSVG value={WALKIE_TALKIE_DOWNLOAD_URL} size={82} marginSize={1} title="Download Walkie Talkie"/><small>Scan to download</small></div><a href={WALKIE_TALKIE_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" aria-label="Download Walkie Talkie">Download Walkie Talkie <span aria-hidden="true">↗</span></a></div>
  </section>
  {handoff&&<section role="status"><h2>{handoff.paymentVerified?"Payment received":"City submitted"}</h2><p>{handoff.paymentVerified?`Your Pro payment for BitcoinWalk in ${handoff.cityName} is verified. The city is awaiting approval.`:`BitcoinWalk in ${handoff.cityName} was submitted successfully and is awaiting approval.`}</p></section>}
  <nav className={styles.actionGrid} aria-label="Quick actions">{actions.map(action=><Link className={styles.actionCard} key={action.href} href={action.href}><strong>{action.label}</strong><span>{action.description}</span><span aria-hidden="true">Open →</span></Link>)}</nav>
  {showSubmissions&&<section><h2>Your city submissions</h2>{activeSubmissions.map(item=><article key={item.cityId} id={`city-submission-${item.cityId}`} aria-current={item.cityId===submittedCity?"true":undefined}><h3>{item.cityName}</h3><p><strong>{item.tier==="paid"?"Pro requested":"Basic"}</strong> · {statusLabel[item.status]}</p>{item.status==="approved"&&<p><Link href={`/${item.slug}`}>View city page →</Link></p>}{item.status==="needs-changes"&&<p>This submission awaits a host correction before it can be approved. Open <Link href="/admin/my-cities">Cities</Link> to review the feedback and resubmit.</p>}</article>)}{!!archivedSubmissions.length&&<details><summary>Archived cities ({archivedSubmissions.length})</summary><p>Archived cities are read-only and hidden from public and active host views. Contact BitcoinWalk to request restoration.</p>{archivedSubmissions.map(item=><article key={item.cityId}><h3>{item.cityName}</h3><p><strong>{item.tier==="paid"?"Pro requested":"Basic"}</strong> · Archived</p></article>)}</details>}</section>}
  {session.role==="organizer"&&<p>Your city publishing permissions and individual hosting assignments remain separate.</p>}
  <AdminDataStatus health={summaryHealth} busy={busy} onRetry={()=>void refresh()} scope="Dashboard summary" hideWhenReady/>
  {summary&&<><p className={styles.updated}>Updated {new Date(summary.checkedAt).toLocaleString()}. Unavailable data is not treated as zero.</p><section><h2>At a glance</h2><div className={styles.metrics}>{session.role!=="member"&&metric("Approved cities",summary.cities,session.role==="super-admin"?"/admin/cities":"/admin/my-cities")}{session.role!=="member"&&metric("Current and upcoming walks",summary.walks,"/admin/walks")}{(session.role!=="member"||(summary.hosting.value??0)>0)&&metric("Walks you host",summary.hosting,"/admin/walks")}{session.role==="super-admin"&&metric("Pending city requests",summary.pending,"/admin/requests")}</div></section>{(session.role!=="member"||(summary.hosting.value??0)>0)&&<DashboardUpcoming summary={summary} role={session.role}/>}</>}
  <p className={styles.assurance}>Actions still require the appropriate identity, permissions and signatures.</p>
 </main>;
}
