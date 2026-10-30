"use client";
import {useRef,useState} from "react";
import type {ProProfileOutcomes} from "../domain/pro-profile-outcomes";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {sponsorRequest} from "../payments/sponsor-auth";
import styles from "../app/admin/sponsors/sponsors.module.css";

export function ProProfileOutcomeCounts({report}:{report:ProProfileOutcomes}){
 return <><div className={styles.outcomeMetrics}><div><strong>{report.checked}</strong><span>Current Pro cities checked</span></div><div><strong>{report.complete}</strong><span>Profiles verified complete</span></div><div><strong>{report.actionRequired}</strong><span>Action required</span></div><div><strong>{report.unknown}</strong><span>Unknown · retry checks</span></div></div><p>Checked {new Date(report.checkedAt*1000).toLocaleString()}. This is a current check, not a historical completion total.</p></>;
}

export default function ProProfileOutcomeCheck({actor}:{actor:string}){
 const [report,setReport]=useState<ProProfileOutcomes|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),lock=useRef(false);
 async function check(){
  if(lock.current)return;lock.current=true;setBusy(true);setReport(null);setError(false);
  try{
   if(!isSuperAdmin(actor)||await getBrowserExtensionPubkey()!==actor)throw Error();
   const event=await signWithBrowserExtension(sponsorRequest("profile-outcomes",window.location.origin));
   const response=await fetch("/api/sponsorships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"profile-outcomes",event}),cache:"no-store",signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error();
   const data=await response.json();
   if(await getBrowserExtensionPubkey()!==actor)throw Error();
   setReport(data.profiles);
  }catch{setError(true);}finally{lock.current=false;setBusy(false);}
 }
 return <section className={styles.outcomeReport} aria-labelledby="pro-profile-outcome-heading" aria-busy={busy}>
  <header><div><h2 id="pro-profile-outcome-heading">Verified Pro profile completion</h2><p>All current Pro cities in this environment, including older setups. Separate from the 90-day setup cohort above.</p></div><button type="button" disabled={busy} onClick={()=>void check()}>{busy?"Checking profiles…":"Check Pro profile completion"}</button></header>
  <div role="status">{error?<p>Profile checks could not finish. Retry; payment reporting is unaffected.</p>:report?<ProProfileOutcomeCounts report={report}/>:<p>{busy?"Checking public profile and service evidence. No settings will change.":"Not checked yet. Run a signed, read-only check to see verified completion."}</p>}</div>
  <details><summary>What counts as complete?</summary><p>The existing identity-health checks must pass: city signer, profile and avatar, NIP-05, Lightning address, authoritative city binding and recovery acknowledgement. Unknown evidence is not counted as success. Pilot and Basic cities are excluded.</p><p>No telemetry history or private identifiers are stored by this report. App opens and community joins remain unmeasured: a link click is not proof of either.</p></details>
 </section>;
}
