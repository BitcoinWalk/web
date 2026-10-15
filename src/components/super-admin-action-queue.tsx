"use client";

import Link from "next/link";
import {useCallback,useRef,useState} from "react";
import type {CityIdentityHealth,CityIdentityHealthCheck} from "../server/pro-city-identity-health";
import {authorizeProSetup,proSetupTemplate} from "../nostr/pro-setup-command";
import {signWithBrowserExtension} from "../nostr/signer";
import {paymentFetch,signPayment} from "./city-payment";
import {useDashboardAutoLoad} from "./dashboard-context";
import styles from "./requests-screen.module.css";

const checkSymbols:Record<CityIdentityHealthCheck["state"],string>={pass:"✓",fail:"!",unknown:"?",future:"○","not-applicable":"—"};
const checkLabels:Record<CityIdentityHealthCheck["state"],string>={pass:"Verified",fail:"Action required",unknown:"Could not verify",future:"Planned","not-applicable":"Not required"};
type ProvisioningStatus={reservation:{state:string}|null;activation:{state:string;nip05:string;lnurl:string;updatedAt?:number}|null;payoutUpdate:{state:string;payoutVersion:number;updatedAt?:number}|null;activationEnabled:boolean};
type ActionReceipt={cityName:string;checkedAt:number;provisioning:ProvisioningStatus;changed:boolean;resolved:boolean;remaining:string[]};

function setupUrl(row:CityIdentityHealth){
 const path=`/admin/upgrade?city=${encodeURIComponent(row.cityId)}`;
 return row.availableInEnvironment?path:`https://bitcoinwalk.org${path}`;
}

function actionFor(row:CityIdentityHealth){
 const failed=new Set(row.checks.filter(check=>check.state==="fail").map(check=>check.key));
 const organizer=failed.has("identity")||failed.has("recovery");
 const activation=failed.has("binding")&&!organizer;
 const provisioning=!organizer&&!activation&&["profile","nip05","lightning"].some(key=>failed.has(key as CityIdentityHealthCheck["key"]));
 const unknown=row.checks.some(check=>check.state==="unknown");
 if(organizer)return {owner:"Host",kind:"organizer" as const,title:"City signer setup is incomplete",detail:"Send the host setup link. The host must connect the exact city signer and confirm its recovery method; the super-admin must never create or hold that key."};
 if(activation)return {owner:"Super-admin",kind:"activation" as const,title:"Official city identity needs activation",detail:"Review the signed identity proofs, attest the official city identity, then publish and verify the exact binding."};
 if(provisioning)return {owner:"Super-admin",kind:"provisioning" as const,title:"Managed identity services need attention",detail:"Verify the public profile evidence, then safely reconcile NIP-05 and Lightning-address provisioning from the existing durable records."};
 if(unknown)return {owner:"Super-admin",kind:"unknown" as const,title:"Evidence must be rechecked",detail:"A relay or provider check was inconclusive. Recheck before changing anything; missing evidence is not proof of failure."};
 return {owner:"Super-admin",kind:"review" as const,title:"Setup needs review",detail:"Review the verification checklist before taking another action."};
}

export default function SuperAdminActionQueue({actor}:{actor:string}){
 const lock=useRef(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[rows,setRows]=useState<CityIdentityHealth[]>([]),[message,setMessage]=useState(""),[copyState,setCopyState]=useState<Record<string,"copied"|"failed">>({}),[workingCity,setWorkingCity]=useState(""),[receipt,setReceipt]=useState<ActionReceipt|null>(null);
 const load=useCallback(async(completion?:{before:CityIdentityHealth;provisioning:ProvisioningStatus})=>{if(lock.current||!actor)return;lock.current=true;setBusy(true);if(!completion)setMessage("");try{
  const event=await signPayment({action:"list"},actor),body=await paymentFetch(event);
  const next=body.identityHealth??[];setRows(next);setLoaded(true);
  if(completion){const after=next.find(item=>item.cityId===completion.before.cityId),remaining=after?.checks.filter(check=>check.state==="fail"||check.state==="unknown").map(check=>check.label)??[],fingerprint=(row?:CityIdentityHealth)=>JSON.stringify(row?.checks.map(check=>[check.key,check.state])??[]),changed=fingerprint(completion.before)!==fingerprint(after),resolved=!after||after.status==="complete";
   setReceipt({cityName:completion.before.cityName,checkedAt:Date.now(),provisioning:completion.provisioning,changed,resolved,remaining});setMessage(`${completion.before.cityName}: provisioning check finished. Review the result below.`);
  }else setMessage(body.identityHealthError||"Identity and managed-service evidence refreshed.");
 }catch(error){setLoaded(true);setMessage(error instanceof Error?error.message:"Post-approval checks could not be loaded.");}finally{lock.current=false;setBusy(false);}},[actor]);
 useDashboardAutoLoad(async()=>{await load();});
 const followUps=rows.filter(row=>row.tier!=="basic"&&row.status!=="complete"&&row.status!=="not-applicable");
 async function copySetup(row:CityIdentityHealth){try{await navigator.clipboard.writeText(new URL(setupUrl(row),window.location.origin).toString());setCopyState(value=>({...value,[row.cityId]:"copied"}));}catch{setCopyState(value=>({...value,[row.cityId]:"failed"}));}}
 async function retry(row:CityIdentityHealth){if(lock.current||!actor)return;lock.current=true;setBusy(true);setWorkingCity(row.cityId);setMessage("");try{
  const origin=window.location.origin,command={action:"retry-city-provisioning" as const,cityId:row.cityId},event=await signWithBrowserExtension(proSetupTemplate(command,origin));
  if(event.pubkey!==actor||JSON.stringify(authorizeProSetup(event,origin))!==JSON.stringify(command))throw new Error("Connect the BitcoinWalk super-admin identity.");
  const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60_000)}),body=await response.json();
  if(!response.ok)throw new Error(body.error||"Provisioning status could not be checked.");
  setMessage(`${row.cityName}: provider reconciliation completed. Refreshing public evidence…`);
  lock.current=false;setBusy(false);setWorkingCity("");await load({before:row,provisioning:body.provisioning as ProvisioningStatus});return;
 }catch(error){setMessage(error instanceof Error?error.message:"Provisioning recovery failed safely.");lock.current=false;setBusy(false);setWorkingCity("");return;}
 }
 return <section className={`${styles.module} ${styles.followUpModule}`} id="post-approval-follow-ups">
  <div className={styles.moduleHeader}><div><h2>Identity &amp; service follow-ups ({followUps.length})</h2><p>Post-approval work for city signers, public profiles, NIP-05, Lightning addresses and official identity bindings.</p></div><button className={styles.refresh} type="button" disabled={busy} onClick={()=>void load()}>{busy&&!workingCity?"Refreshing…":"Refresh"}</button></div>
  {message&&<p className={styles.notice} role="status" aria-live="polite">{message}</p>}
  {receipt&&<section className={styles.provisioningReceipt} data-resolved={receipt.resolved} aria-labelledby="provisioning-result-title">
   <div className={styles.receiptHeading}><div><span className={styles.receiptIcon} aria-hidden="true">{receipt.resolved?"✓":"!"}</span><div><h3 id="provisioning-result-title">{receipt.cityName} provisioning result</h3><p>Checked {new Date(receipt.checkedAt).toLocaleString()}</p></div></div><button type="button" onClick={()=>setReceipt(null)} aria-label="Dismiss provisioning result">×</button></div>
   <dl className={styles.receiptStates}><div><dt>Private reservation</dt><dd>{receipt.provisioning.reservation?.state??"Not started"}</dd></div><div><dt>Public activation</dt><dd>{receipt.provisioning.activation?.state??(receipt.provisioning.activationEnabled?"Not started":"Disabled")}</dd></div><div><dt>NIP-05</dt><dd>{receipt.provisioning.activation?.nip05??"Not active"}</dd></div><div><dt>Lightning address</dt><dd>{receipt.provisioning.activation?.lnurl??"Not active"}</dd></div>{receipt.provisioning.payoutUpdate&&<div><dt>Payout update</dt><dd>{receipt.provisioning.payoutUpdate.state}</dd></div>}</dl>
   {receipt.resolved?<p><strong>Complete.</strong> The city no longer has an identity or managed-service follow-up.</p>:receipt.changed?<p><strong>Evidence changed.</strong> The queue now shows the checks that still require attention{receipt.remaining.length?`: ${receipt.remaining.join(", ")}.`:"."}</p>:<p><strong>No visible status changed.</strong> The provider already returned the same durable state, or public relay evidence has not caught up yet. No duplicate setup was created.{receipt.remaining.length?` Still waiting on: ${receipt.remaining.join(", ")}.`:""}</p>}
  </section>}
  {!loaded?<div className={styles.empty}><strong>{busy?"Checking city services…":"Follow-ups not loaded"}</strong><span>{busy?"Reading durable setup and public verification evidence.":"Use Refresh to try again."}</span></div>:!followUps.length?<div className={styles.empty}><strong>All caught up</strong><span>No Pro city identity or managed-service follow-ups need attention.</span></div>:<div className={styles.followUpList}>{followUps.map(row=>{const action=actionFor(row),problems=row.checks.filter(check=>check.state==="fail"||check.state==="unknown");return <article className={styles.followUpCard} key={row.cityId}>
   <div className={styles.followUpHeading}><div><h3>{row.cityName}</h3><p>/{row.slug} · {row.tier==="pro"?"Pro city":"Pilot setup"}</p></div><span className={action.owner==="Super-admin"?styles.ownerAdmin:styles.ownerHost}>{action.owner}</span></div>
   <div className={styles.followUpSummary}><strong>{action.title}</strong><p>{action.detail}</p></div>
   <details className={styles.followUpDetails}><summary>{problems.length} check{problems.length===1?"":"s"} need attention</summary><ul>{problems.map(check=><li key={check.key}><span aria-hidden="true">{checkSymbols[check.state]}</span><span><strong>{check.label}</strong><small>{checkLabels[check.state]} · {check.detail}</small></span></li>)}</ul></details>
   <div className={styles.followUpActions}>{action.kind==="organizer"?<><button type="button" disabled={busy} onClick={()=>void copySetup(row)}>{copyState[row.cityId]==="copied"?"Host setup link copied":"Copy host setup link"}</button><Link href={setupUrl(row)} target="_blank" rel="noreferrer">Preview setup ↗</Link></>:action.kind==="activation"?<a className={styles.actionLink} href="#pro-city-activations">Review activation request</a>:action.kind==="provisioning"?<button className={styles.primaryAction} type="button" disabled={busy} onClick={()=>void retry(row)}>{workingCity===row.cityId?"Checking…":"Check / retry provisioning"}</button>:<button type="button" disabled={busy} onClick={()=>void load()}>{busy?"Checking…":"Recheck evidence"}</button>}<Link href={row.availableInEnvironment?`/${row.slug}`:`https://bitcoinwalk.org/${row.slug}`} target="_blank" rel="noreferrer">Open city ↗</Link></div>
   {copyState[row.cityId]==="failed"&&<p role="alert">Copy failed. Open the setup page and copy its address.</p>}
  </article>;})}</div>}
 </section>;
}
