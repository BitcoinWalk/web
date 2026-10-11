"use client";

import type {CityIdentityHealth,CityIdentityHealthCheck,IdentityHealthStatus} from "../server/pro-city-identity-health";

const labels:Record<IdentityHealthStatus,string>={complete:"Complete","action-required":"Action required","not-configured":"Not configured",unknown:"Unknown","not-applicable":"Not applicable"};
const colors:Record<IdentityHealthStatus,string>={complete:"#176b3a","action-required":"#8a5a00","not-configured":"#5f6670",unknown:"#5f6670","not-applicable":"#5f6670"};
const symbols:Record<CityIdentityHealthCheck["state"],string>={pass:"✓",fail:"!",unknown:"?",future:"○","not-applicable":"—"};
export function identityHealthLabel(row?:CityIdentityHealth){return row?labels[row.status]:"Checking identity…";}

function Status({row}:{row:CityIdentityHealth}){return <span style={{display:"inline-block",border:`1px solid ${colors[row.status]}`,borderRadius:"999px",padding:"0.12rem 0.55rem",color:colors[row.status],fontWeight:700,fontSize:"0.85em"}}>{labels[row.status]}</span>;}
function time(value:number){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value*1000));}

export function CityIdentityHealthOverview({rows,busy,error,onRecheck}:{rows:CityIdentityHealth[];busy:boolean;error?:string;onRecheck():void}){
 const pro=rows.filter(row=>row.tier==="pro"),complete=pro.filter(row=>row.status==="complete").length,pilots=rows.filter(row=>row.tier==="pilot");
 return <section aria-labelledby="city-identity-health-heading" style={{border:"1px solid #d7dce2",borderRadius:"0.65rem",padding:"1rem",margin:"1rem 0"}}>
  <h3 id="city-identity-health-heading" style={{marginTop:0}}>City identity health</h3>
  <p><strong>{complete} of {pro.length} Pro {pro.length===1?"city":"cities"} complete</strong>. Basic cities are not required to have a separate city identity.</p>
  {!!pilots.length&&<p><strong>{pilots.length} test {pilots.length===1?"identity":"identities"}</strong> shown separately; staging pilots do not count as paid production cities.</p>}
  <button type="button" disabled={busy} onClick={onRecheck}>{busy?"Checking…":"Recheck identities"}</button>
  {error&&<p role="alert">{error}</p>}
  {!!rows.length&&<p><small>Evidence checked {time(Math.max(...rows.map(row=>row.checkedAt)))}. Open a city below for its verification checklist.</small></p>}
 </section>;
}

export function CityIdentityHealthDetails({row}:{row?:CityIdentityHealth}){
 if(!row)return <section aria-label="City identity health"><h4>City identity health</h4><p>Identity evidence is not available yet. Select Recheck identities.</p></section>;
 return <section aria-label="City identity health" style={{border:"1px solid #d7dce2",borderRadius:"0.65rem",padding:"1rem",margin:"1rem 0"}}>
  <h4 style={{marginTop:0}}>City identity health <Status row={row}/></h4>
  <p>{row.tier==="basic"?"A dedicated identity is a Pro feature and is not required for this city.":<>{row.tier==="pilot"?<strong>Test identity · </strong>:null}Checked {time(row.checkedAt)}{row.lastVerifiedAt?<> · durable verification updated {time(row.lastVerifiedAt)}</>:null}</>}</p>
  <details><summary><strong>Identity verification checklist</strong></summary><ul style={{listStyle:"none",paddingLeft:0}}>{row.checks.map(item=><li key={item.key} style={{margin:"0.8rem 0"}}><span aria-hidden="true" style={{display:"inline-block",width:"1.5rem",fontWeight:700}}>{symbols[item.state]}</span><strong>{item.label}</strong><br/><span style={{display:"inline-block",paddingLeft:"1.5rem"}}>{item.detail}</span></li>)}</ul></details>
 </section>;
}
