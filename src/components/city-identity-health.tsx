"use client";

import Link from "next/link";
import {useState} from "react";
import type {CityIdentityHealth,CityIdentityHealthCheck,IdentityHealthStatus} from "../server/pro-city-identity-health";

const labels:Record<IdentityHealthStatus,string>={complete:"Complete","action-required":"Action required","not-configured":"Not configured",unknown:"Unknown","not-applicable":"Not applicable"};
const colors:Record<IdentityHealthStatus,string>={complete:"#176b3a","action-required":"#8a5a00","not-configured":"#5f6670",unknown:"#5f6670","not-applicable":"#5f6670"};
const symbols:Record<CityIdentityHealthCheck["state"],string>={pass:"✓",fail:"!",unknown:"?",future:"○","not-applicable":"—"};
export function identityHealthLabel(row?:CityIdentityHealth){return row?labels[row.status]:"Checking identity…";}

function Status({row}:{row:CityIdentityHealth}){return <span style={{display:"inline-block",border:`1px solid ${colors[row.status]}`,borderRadius:"999px",padding:"0.12rem 0.55rem",color:colors[row.status],fontWeight:700,fontSize:"0.85em"}}>{labels[row.status]}</span>;}
function time(value:number){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value*1000));}
function OrganizerSetupLink({row}:{row:CityIdentityHealth}){
 const [copyState,setCopyState]=useState<"idle"|"copied"|"failed">("idle"),path=`/admin/upgrade?city=${encodeURIComponent(row.cityId)}`,href=row.availableInEnvironment?path:`https://bitcoinwalk.org${path}`;
 async function copy(){try{await navigator.clipboard.writeText(new URL(href,window.location.origin).toString());setCopyState("copied");}catch{setCopyState("failed");}}
 return <><button type="button" onClick={copy}>{copyState==="copied"?"Copied organizer setup link":"Copy organizer setup link"}</button>{" "}<Link href={href} target="_blank" rel="noreferrer">Preview organizer setup ↗</Link>{copyState==="failed"?<span role="alert"> Copy failed. Open the setup page and copy its address.</span>:null}</>;
}

function IdentityActions({row,busy=false,onRecheck,onOpenCity}:{row:CityIdentityHealth;busy?:boolean;onRecheck?:()=>void;onOpenCity?:()=>void}){
 const failed=new Set(row.checks.filter(check=>check.state==="fail").map(check=>check.key)),unknown=row.checks.some(check=>check.state==="unknown"),organizerRequired=failed.has("identity")||failed.has("recovery"),bindingRequired=failed.has("binding")&&!organizerRequired,provisioningRequired=!organizerRequired&&!bindingRequired&&(failed.has("profile")||failed.has("nip05")||failed.has("lightning")),publicHref=row.availableInEnvironment?`/${row.slug}`:`https://bitcoinwalk.org/${row.slug}`;
 return <div style={{borderTop:"1px solid #d7dce2",marginTop:"0.8rem",paddingTop:"0.8rem"}}><strong>Next action</strong>
  {organizerRequired?<><p>The organizer must create or reconnect the exact city signer and confirm its recovery method. The super-admin can send the setup link, but cannot create or hold that private key.</p><p><OrganizerSetupLink row={row}/></p></>:null}
  {bindingRequired?<p>Review and sign the exact city-identity activation request after the organizer proof is complete.</p>:null}
  {provisioningRequired?<p>Review the activation record and retry provisioning only after its identity, NIP-05 and Lightning evidence agree.</p>:null}
  {unknown?<><p>Recheck before changing anything. Missing relay evidence is not proof that the setup failed.</p>{onRecheck?<p><button type="button" disabled={busy} onClick={onRecheck}>{busy?"Checking…":"Recheck this evidence"}</button></p>:null}</>:null}
  {row.status==="complete"?<p>No corrective action is required.</p>:null}
  <p>{bindingRequired?<><Link href="/admin/requests">Review activation request</Link>{" · "}</>:null}{provisioningRequired?<><Link href="/admin/requests">Review provisioning status</Link>{" · "}</>:null}<Link href={publicHref} target="_blank" rel="noreferrer">Open public city ↗</Link>{onOpenCity&&row.availableInEnvironment?<>{" · "}<button type="button" onClick={onOpenCity}>Open full city record</button></>:null}</p>
 </div>;
}

export function CityIdentityHealthOverview({rows,busy,error,onRecheck,onReview}:{rows:CityIdentityHealth[];busy:boolean;error?:string;onRecheck():void;onReview(cityId:string):void}){
 const [expanded,setExpanded]=useState<string>("");
 const pro=rows.filter(row=>row.tier==="pro"),complete=pro.filter(row=>row.status==="complete").length;
 return <section aria-labelledby="city-identity-health-heading" style={{border:"1px solid #d7dce2",borderRadius:"0.65rem",padding:"1rem",margin:"1rem 0"}}>
  <h3 id="city-identity-health-heading" style={{marginTop:0}}>City identity health</h3>
  <p><strong>{complete} of {pro.length} Pro {pro.length===1?"city":"cities"} complete</strong>. Basic cities are not required to have a separate city identity.</p>
  {!!pro.length&&<ul style={{listStyle:"none",padding:0,display:"grid",gap:"0.75rem"}}>{pro.map(row=><li key={row.cityId} style={{border:"1px solid #d7dce2",borderRadius:"0.5rem",padding:"0.75rem"}}>
   <p style={{marginTop:0}}><strong>{row.cityName}</strong> · Paid Pro city · <Status row={row}/></p>
   <p>{row.availableInEnvironment?"This city can be reviewed in the current environment.":"This paid production city is not present in the staging city directory; its inventory status is still shown here."}</p>
   <button type="button" disabled={busy} aria-expanded={expanded===row.cityId} aria-controls={`identity-review-${row.cityId}`} onClick={()=>setExpanded(value=>value===row.cityId?"":row.cityId)}>{expanded===row.cityId?"Close review":`Review ${row.cityName}`}</button>{" "}{!row.availableInEnvironment?<a href={`https://bitcoinwalk.org/${row.slug}`} target="_blank" rel="noreferrer">Open production city ↗</a>:null}
   {expanded===row.cityId?<div id={`identity-review-${row.cityId}`}><CityIdentityHealthDetails row={row} onRecheck={onRecheck} busy={busy} onOpenCity={()=>onReview(row.cityId)}/></div>:null}
  </li>)}</ul>}
  <button type="button" disabled={busy} onClick={onRecheck}>{busy?"Checking…":"Recheck identities"}</button>
  {error&&<p role="alert">{error}</p>}
  {!!rows.length&&<p><small>Evidence checked {time(Math.max(...rows.map(row=>row.checkedAt)))}. Open a city below for its verification checklist.</small></p>}
 </section>;
}

export function CityIdentityHealthDetails({row,busy=false,onRecheck,onOpenCity}:{row?:CityIdentityHealth;busy?:boolean;onRecheck?:()=>void;onOpenCity?:()=>void}){
 if(!row)return <section aria-label="City identity health"><h4>City identity health</h4><p>Identity evidence is not available yet. Select Recheck identities.</p></section>;
 return <section aria-label={`${row.cityName} identity health`} style={{border:"1px solid #d7dce2",borderRadius:"0.65rem",padding:"1rem",margin:"1rem 0"}}>
  <h4 style={{marginTop:0}}>Identity verification — {row.cityName} <Status row={row}/></h4>
  <p>{row.tier==="basic"?"A dedicated identity is a Pro feature and is not required for this city.":<>{row.tier==="pilot"?<strong>Test identity · </strong>:null}Checked {time(row.checkedAt)}{row.lastVerifiedAt?<> · durable verification updated {time(row.lastVerifiedAt)}</>:null}</>}</p>
  <details><summary><strong>Identity verification checklist</strong></summary><ul style={{listStyle:"none",paddingLeft:0}}>{row.checks.map(item=><li key={item.key} style={{margin:"0.8rem 0"}}><span aria-hidden="true" style={{display:"inline-block",width:"1.5rem",fontWeight:700}}>{symbols[item.state]}</span><strong>{item.label}</strong><br/><span style={{display:"inline-block",paddingLeft:"1.5rem"}}>{item.detail}</span></li>)}</ul></details>
  {row.tier!=="basic"&&<IdentityActions row={row} busy={busy} onRecheck={onRecheck} onOpenCity={onOpenCity}/>}
 </section>;
}
