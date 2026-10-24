"use client";
import Link from "next/link";
import {useCallback,useRef,useState} from "react";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";
import {identityApprovalProblems} from "../domain/identity-review";
import {authorizeProSetup,proSetupTemplate} from "../nostr/pro-setup-command";
import {signWithBrowserExtension} from "../nostr/signer";
import {paymentFetch,signPayment} from "./city-payment";
import {useDashboardAutoLoad} from "./dashboard-context";
import styles from "./requests-screen.module.css";

export default function SuperAdminActionQueue({actor}:{actor:string}){
 const lock=useRef(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[rows,setRows]=useState<CityIdentityHealth[]>([]),[message,setMessage]=useState("");
 const [imageStates,setImageStates]=useState<Record<string,"loaded"|"failed">>({});
 const load=useCallback(async()=>{if(lock.current||!actor)return;lock.current=true;setBusy(true);try{
  const body=await paymentFetch(await signPayment({action:"list"},actor));setRows(body.identityHealth??[]);setLoaded(true);setMessage(body.identityHealthError||"");
 }catch{setMessage("Checks are temporarily unavailable. No city settings changed.");}finally{lock.current=false;setBusy(false);}},[actor]);
 useDashboardAutoLoad(load);
 const followUps=rows.filter(row=>row.tier!=="basic"&&identityApprovalProblems(row).length>0);
 const operational=(row:CityIdentityHealth)=>row.checks.filter(check=>(check.key==="nip05"||check.key==="lightning"||check.state==="unknown")&&(check.state==="fail"||check.state==="unknown"));
 const serviceIssues=rows.filter(row=>operational(row).length);
 async function accept(row:CityIdentityHealth){
  if(lock.current||!row.profilePreview?.eligible||imageStates[row.profilePreview.fingerprint]!=="loaded")return;lock.current=true;setBusy(true);setMessage("Approve this name and avatar in your signer…");
  try{
   const origin=window.location.origin,command={action:"accept-city-profile" as const,cityId:row.cityId,fingerprint:row.profilePreview.fingerprint},event=await signWithBrowserExtension(proSetupTemplate(command,origin));
   if(event.pubkey!==actor||JSON.stringify(authorizeProSetup(event,origin))!==JSON.stringify(command))throw new Error("Wrong signer or changed approval. Reconnect the super-admin account.");
   const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60_000)}),body=await response.json();
   if(!response.ok)throw new Error(body.error||"Profile could not be accepted.");
   setRows(current=>current.map(item=>item.cityId===row.cityId?body.identityHealth:item));setMessage(`${row.cityName}: name and avatar accepted. Service checks remain independent.`);
  }catch(error){setMessage(error instanceof Error?error.message:"Profile could not be accepted.");}finally{lock.current=false;setBusy(false);}
 }
 return <section className={`${styles.module} ${styles.followUpModule}`} id="post-approval-follow-ups">
  <div className={styles.moduleHeader}><div><h2>Identity reviews ({followUps.length})</h2><p>Only host setup, identity activation and profile decisions need attention. NIP-05 and Lightning addresses are checked automatically.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?"Checking…":"Refresh"}</button></div>
  {message&&<p role="status" aria-live="polite">{message}</p>}
  {!loaded?<p>Loading identity reviews…</p>:!followUps.length?<p>No approvals needed.</p>:<div className={styles.followUpList}>{followUps.map(row=>{
   const problems=identityApprovalProblems(row),host=problems.some(check=>check.key==="identity"||check.key==="recovery"),binding=problems.some(check=>check.key==="binding"),preview=row.profilePreview;
   return <article className={styles.followUpCard} key={row.cityId}><h3>{row.cityName}</h3>
    {host?<p>The host must connect the city signer and confirm its recovery method.</p>:binding?<p>Review the signed city identity activation request.</p>:<p>Preview and accept the city’s display name and avatar.</p>}
    {preview&&<div className={styles.profilePreview}>
     {/* eslint-disable-next-line @next/next/no-img-element */}
     <img key={preview.fingerprint} src={preview.picture} alt={`${row.cityName} profile preview`} width={64} height={64} referrerPolicy="no-referrer" onLoad={()=>setImageStates(current=>({...current,[preview.fingerprint]:"loaded"}))} onError={()=>setImageStates(current=>({...current,[preview.fingerprint]:"failed"}))}/>
     <div><strong>{preview.name}</strong><p>{preview.website}</p><small>{preview.accepted?"Accepted appearance":"City-signed profile"}</small></div></div>}
    <div className={styles.followUpActions}>{host?<Link href={`${row.availableInEnvironment?"":"https://bitcoinwalk.org"}/admin/my-cities?city=${encodeURIComponent(row.cityId)}#pro-city-services`}>Open host setup</Link>:binding?<a href="#pro-city-activations">Review activation request</a>:preview?<button type="button" disabled={busy||!preview.eligible||preview.accepted||imageStates[preview.fingerprint]!=="loaded"} onClick={()=>void accept(row)}>Accept name and avatar</button>:<span>Waiting for a readable city profile.</span>}<Link href={row.availableInEnvironment?`/${row.slug}`:`https://bitcoinwalk.org/${row.slug}`} target="_blank" rel="noreferrer">Open city ↗</Link></div>
    {preview&&imageStates[preview.fingerprint]==="failed"&&<p role="alert">The avatar could not be loaded. Acceptance is disabled until the preview is available.</p>}
    {preview&&!preview.eligible&&<p>Waiting for matching public profile evidence and a verified city binding. Refresh to check again.</p>}
   </article>;
  })}</div>}
  {!!serviceIssues.length&&<details><summary>Automatic checks — {serviceIssues.length} cities pending verification or reporting an issue (no approval required)</summary><p>These results do not create approval requests or change payment permissions.</p><ul>{serviceIssues.map(row=><li key={row.cityId}><strong>{row.cityName}</strong>{operational(row).map(check=><p key={check.key}>{check.label}: {check.detail}</p>)}</li>)}</ul><Link href="/admin/cities">View operational city details</Link></details>}
 </section>;
}
