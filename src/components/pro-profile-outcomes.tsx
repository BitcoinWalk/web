"use client";
import {useRef,useState} from "react";
import type {ProProfileOutcomes} from "../domain/pro-profile-outcomes";
import type {ProCommunityHandoffOutcomes} from "../domain/pro-community-handoff-outcomes";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {sponsorRequest} from "../payments/sponsor-auth";
import styles from "../app/admin/sponsors/sponsors.module.css";

export function ProProfileOutcomeCounts({report}:{report:ProProfileOutcomes}){
 return <><div className={styles.outcomeMetrics}><div><strong>{report.checked}</strong><span>Current Pro cities checked</span></div><div><strong>{report.complete}</strong><span>Profiles verified complete</span></div><div><strong>{report.actionRequired}</strong><span>Action required</span></div><div><strong>{report.unknown}</strong><span>Unknown · retry checks</span></div></div><p>Checked {new Date(report.checkedAt*1000).toLocaleString()}. This is a current check, not a historical completion total.</p></>;
}

export function ProCommunityHandoffCounts({report}:{report:ProCommunityHandoffOutcomes}){
 return <><h3>Confirmed community handoff</h3><div className={styles.outcomeMetrics}><div><strong>{report.checked}</strong><span>Current Pro cities checked</span></div><div><strong>{report.confirmed}</strong><span>Owners in city community</span></div><div><strong>{report.actionRequired}</strong><span>Action required</span></div><div><strong>{report.unknown}</strong><span>Unknown · retry checks</span></div></div><p>Checked {new Date(report.checkedAt*1000).toLocaleString()}. This is current signed roster evidence, not activity tracking.</p></>;
}

export default function ProProfileOutcomeCheck({actor}:{actor:string}){
 const [report,setReport]=useState<ProProfileOutcomes|null>(null),[communityHandoff,setCommunityHandoff]=useState<ProCommunityHandoffOutcomes|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),lock=useRef(false);
 async function check(){
  if(lock.current)return;lock.current=true;setBusy(true);setReport(null);setCommunityHandoff(null);setError(false);
  try{
   if(!isSuperAdmin(actor)||await getBrowserExtensionPubkey()!==actor)throw Error();
   const event=await signWithBrowserExtension(sponsorRequest("profile-outcomes",window.location.origin));
   const response=await fetch("/api/sponsorships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"profile-outcomes",event}),cache:"no-store",signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error();
   const data=await response.json();
   if(await getBrowserExtensionPubkey()!==actor)throw Error();
   setReport(data.profiles);setCommunityHandoff(data.communityHandoff);
  }catch{setError(true);}finally{lock.current=false;setBusy(false);}
 }
 return <section className={styles.outcomeReport} aria-labelledby="pro-profile-outcome-heading" aria-busy={busy}>
  <header><div><h2 id="pro-profile-outcome-heading">Verified Pro outcomes</h2><p>Current profile completion and confirmed city-community handoff. Separate from the 90-day setup cohort above.</p></div><button type="button" disabled={busy} onClick={()=>void check()}>{busy?"Checking outcomes…":"Check Pro outcomes"}</button></header>
  <div role="status">{error?<p>Profile and community checks could not finish. Retry; payment reporting is unaffected.</p>:report&&communityHandoff?<><ProProfileOutcomeCounts report={report}/><ProCommunityHandoffCounts report={communityHandoff}/></>:<p>{busy?"Checking public profile, service and community evidence. No settings will change.":"Not checked yet. Run a signed, read-only check to see verified completion."}</p>}</div>
  <details><summary>What counts as complete?</summary><p>The existing identity-health checks must pass: city signer, profile and avatar, NIP-05, Lightning address, authoritative city binding and recovery acknowledgement. Unknown evidence is not counted as success. Pilot and Basic cities are excluded.</p><p>Community handoff is confirmed only when the current Pro owner appears in the latest signed membership roster for that city&apos;s exact configured community. It does not prove app installation, message activity or readership.</p><p>No telemetry history, messages or private identifiers are stored by this report.</p></details>
 </section>;
}
