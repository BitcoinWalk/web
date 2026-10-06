"use client";

import {useRef,useState} from "react";
import {type Event} from "nostr-tools";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import {relayConfig} from "../lib/relay-config";
import {queryCalendarEvents} from "../nostr/city-records";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {assertExactSigned} from "../nostr/moderation";
import {publishVerifiedEvent} from "../nostr/relay";
import {createEventModeration,latestEventModerations,moderationKey,queryEventModerations,requireEventModerationRelay,walkAddress,type EventModeration,type EventModerationRecord} from "../nostr/event-moderation";
import CityFinder from "./city-finder";

type PendingAction={scope:EventModeration["scope"];target:string;status:EventModeration["status"];eventId?:string;label:string};
type Props={scope:"city"|"walk";fixedCityId?:string;cityName?:string};

export default function EventModerationPanel({scope,fixedCityId,cityName}:Props){
 const dashboard=useDashboard(),lock=useRef(false);
 const initialCity=fixedCityId??"";
 const [busy,setBusy]=useState(false),[cityId,setCityId]=useState(initialCity),[cities,setCities]=useState<{id:string;creator:string}[]>([]),[events,setEvents]=useState<Event[]>([]),[records,setRecords]=useState<EventModerationRecord[]>([]),[reason,setReason]=useState(""),[pending,setPending]=useState<PendingAction|null>(null),[message,setMessage]=useState(scope==="city"?"Loading publishing access…":"Select a city to manage walk visibility.");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Connect the BitcoinWalk super-admin.");}
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(e){setMessage(e instanceof Error?e.message:"Moderation failed.");}finally{lock.current=false;setBusy(false);}}
 async function load(id:string){
  setEvents([]);setRecords([]);setPending(null);setReason("");
  await requireEventModerationRelay(relayConfig.writeRelays);
  const [walks,history]=await Promise.all([scope==="walk"?queryCalendarEvents(relayConfig.writeRelays,{cityId:id}):Promise.resolve([]),queryEventModerations(relayConfig.writeRelays,id)]);
  if(walks.length>=500)throw new Error("City walk read limit reached.");
  await admin();setEvents(walks);setRecords(history);setMessage("Loaded. Reasons are public signed audit records: do not include private information.");
 }
 function selectCity(id:string){setCityId(id);setPending(null);setReason("");if(id)void run(()=>load(id));else{setEvents([]);setRecords([]);setMessage("Select a city to manage walk visibility.");}}
 useDashboardAutoLoad(()=>run(async()=>{
  if(scope==="walk")setCities(dashboard.cities.map(city=>({id:city.id,creator:""})));
  const id=fixedCityId??cityId;if(id){setCityId(id);await load(id);}
 }));
 const heads=latestEventModerations(records),head=(decisionScope:EventModeration["scope"],target:string)=>heads.find(r=>r.decision.scope===decisionScope&&r.decision.target===target);
 async function decide(action:PendingAction){await run(async()=>{
  await requireEventModerationRelay(relayConfig.writeRelays);
  const expected=head(action.scope,action.target),current=latestEventModerations(await queryEventModerations(relayConfig.writeRelays,cityId)).find(r=>moderationKey(r.decision)===`${action.scope}:${action.target}`);
  if(current?.event.id!==expected?.event.id)throw new Error("Moderation changed. Reload this city before continuing.");
  const template=createEventModeration({cityId,scope:action.scope,target:action.target,status:action.status,reason:reason.trim(),...(action.eventId?{eventId:action.eventId}:{}),...(current?{previous:current.event.id}:{})});
  setMessage("Review and approve the moderation signature in your signer…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();
  const recheck=latestEventModerations(await queryEventModerations(relayConfig.writeRelays,cityId)).find(r=>moderationKey(r.decision)===`${action.scope}:${action.target}`);if(recheck?.event.id!==current?.event.id)throw new Error("Moderation changed while signing. Nothing published; reload.");
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
  const saved=latestEventModerations(await queryEventModerations(relayConfig.writeRelays,cityId)).find(r=>moderationKey(r.decision)===`${action.scope}:${action.target}`);if(saved?.event.id!==signed.id)throw new Error("Relay acknowledged but latest decision not confirmed. Reload before retrying.");
  await load(cityId);setMessage(`${action.status}: signed decision confirmed by relay read-back. Existing cancellation and city publication state still apply.`);
 });}
 function begin(action:PendingAction){setPending(action);setReason("");setMessage(`Add a public reason, then sign to ${action.label.toLowerCase()}.`);}
 function reasonForm(action:PendingAction){if(!pending||pending.scope!==action.scope||pending.target!==action.target||pending.status!==action.status)return null;return <div style={{margin:"0.75rem 0 1rem",padding:"1rem",background:"#fff4d6",borderLeft:"4px solid #f7931a"}}><label><strong>Reason</strong><textarea autoFocus value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Required. This becomes part of the public signed audit history." style={{display:"block",width:"100%",marginTop:"0.5rem"}}/></label><button disabled={busy||!reason.trim()} onClick={()=>decide(action)} style={{display:"block",marginTop:"0.75rem",background:"#f7931a",color:"#111",fontWeight:700}}>Sign and {action.label.toLowerCase()}</button><button disabled={busy} onClick={()=>{setPending(null);setReason("");}} style={{marginTop:"0.5rem"}}>Cancel</button></div>;}
 const cityState=head("city",cityId)?.decision.status??"active";
 const visibleEvents=events.filter(event=>head("event",walkAddress(event))?.decision.status!=="hidden");
 const hiddenHeads=heads.filter(row=>row.decision.scope==="event"&&row.decision.status==="hidden");
 if(scope==="city"){
  const action:PendingAction={scope:"city",target:cityId,status:cityState==="suspended"?"active":"suspended",label:cityState==="suspended"?"Resume city":"Suspend city"};
  return <section style={{marginTop:"1.5rem",padding:"1rem",background:"#f7f7f7"}}><h4>Publishing access</h4><p><strong>{cityName??"City"}:</strong> {cityState==="suspended"?"suspended":"active"}</p><p>Suspension blocks new walk publication but keeps the existing city and its published walks visible. To remove them from BitcoinWalk public views, use <strong>Unpublish city</strong>.</p><button disabled={busy||!cityId||!!pending} onClick={()=>begin(action)}>{action.label}</button>{reasonForm(action)}<p role="status">{message}</p><details><summary>Signed publishing decisions ({records.filter(r=>r.decision.scope==="city").length})</summary>{records.filter(r=>r.decision.scope==="city").map(r=><p key={r.event.id} style={{overflowWrap:"anywhere"}}>{r.decision.status} — {r.decision.reason}<br/>{r.event.id}</p>)}</details></section>;
 }
 return <section><h2>Walk visibility</h2><p>Hide a specific walk from BitcoinWalk without cancelling or deleting its signed event. Independent external copies may remain.</p>
 <CityFinder disabled={busy} value={cityId} onChange={selectCity} placeholder="Search cities to moderate…" items={cities.map(city=>{const dashboardCity=dashboard.cities.find(item=>item.id===city.id);return {id:city.id,name:dashboardCity?.name??city.id,keywords:[city.id,city.creator]};})}/>
 <button disabled={busy||!cityId} onClick={()=>run(()=>load(cityId))}>Refresh walks</button><p role="status">{message}</p>
 {cityId&&<><h3>Visible walks ({visibleEvents.length})</h3>{visibleEvents.length?visibleEvents.map(event=>{const action:PendingAction={scope:"event",target:walkAddress(event),status:"hidden",eventId:event.id,label:"Hide walk"};return <div key={event.id}><p>{event.tags.find(t=>t[0]==="title")?.[1]} — {new Date(Number(event.tags.find(t=>t[0]==="start")?.[1])*1000).toLocaleString()}<br/><small style={{overflowWrap:"anywhere"}}>{event.id}</small></p><button disabled={busy||!!pending} onClick={()=>begin(action)}>Hide walk</button>{reasonForm(action)}</div>}):<p>No visible walks.</p>}
 <h3>Hidden walks ({hiddenHeads.length})</h3>{hiddenHeads.length?hiddenHeads.map(row=>{const action:PendingAction={scope:"event",target:row.decision.target,status:"visible",eventId:row.decision.eventId,label:"Unhide walk"};return <div key={row.event.id}><p style={{overflowWrap:"anywhere"}}>{row.decision.target}<br/>{row.decision.reason}</p><button disabled={busy||!!pending} onClick={()=>begin(action)}>Unhide walk</button>{reasonForm(action)}</div>}):<p>No hidden walks.</p>}
 <details><summary>Signed walk visibility history ({records.filter(r=>r.decision.scope==="event").length})</summary>{records.filter(r=>r.decision.scope==="event").map(r=><p key={r.event.id} style={{overflowWrap:"anywhere"}}>{r.decision.status} — {r.decision.reason}<br/>{r.event.id}</p>)}</details></>}
 </section>;
}
