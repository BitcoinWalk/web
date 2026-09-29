"use client";
import {useRef,useState} from "react";
import {type Event} from "nostr-tools";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import {relayConfig} from "../lib/relay-config";
import {queryAuthorizations,queryCalendarEvents} from "../nostr/city-records";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {assertExactSigned} from "../nostr/moderation";
import {publishVerifiedEvent} from "../nostr/relay";
import {createEventModeration,latestEventModerations,moderationKey,queryEventModerations,requireEventModerationRelay,walkAddress,type EventModeration,type EventModerationRecord} from "../nostr/event-moderation";

export default function EventModerationPanel(){
 const dashboard=useDashboard(),lock=useRef(false);
 const [busy,setBusy]=useState(false),[cityId,setCityId]=useState(dashboard.selectedCity),[cities,setCities]=useState<{id:string;creator:string}[]>([]),[events,setEvents]=useState<Event[]>([]),[records,setRecords]=useState<EventModerationRecord[]>([]),[reason,setReason]=useState(""),[message,setMessage]=useState("Load a city to moderate walks or publishing.");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Connect the BitcoinWalk super-admin.");}
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(e){setMessage(e instanceof Error?e.message:"Moderation failed.");}finally{lock.current=false;setBusy(false);}}
 async function load(id:string){setEvents([]);setRecords([]);await requireEventModerationRelay(relayConfig.writeRelays);const [walks,history]=await Promise.all([queryCalendarEvents(relayConfig.writeRelays,{cityId:id}),queryEventModerations(relayConfig.writeRelays,id)]);if(walks.length>=500)throw new Error("City walk read limit reached.");await admin();setEvents(walks);setRecords(history);setMessage("Loaded. Reasons are public signed audit records: do not include private information.");}
 useDashboardAutoLoad(()=>run(async()=>{const grants=await queryAuthorizations(relayConfig.writeRelays);setCities(grants.map(r=>({id:r.grant.cityId,creator:r.grant.creatorPubkey})));if(cityId)await load(cityId);}));
 const heads=latestEventModerations(records),head=(scope:EventModeration["scope"],target:string)=>heads.find(r=>r.decision.scope===scope&&r.decision.target===target);
 async function decide(scope:EventModeration["scope"],target:string,status:EventModeration["status"],eventId?:string){await run(async()=>{
  await requireEventModerationRelay(relayConfig.writeRelays);
  const expected=head(scope,target),current=latestEventModerations(await queryEventModerations(relayConfig.writeRelays,cityId)).find(r=>moderationKey(r.decision)===`${scope}:${target}`);
  if(current?.event.id!==expected?.event.id)throw new Error("Moderation changed. Reload this city before continuing.");
  const template=createEventModeration({cityId,scope,target,status,reason:reason.trim(),...(eventId?{eventId}:{}),...(current?{previous:current.event.id}:{})});
  if(!window.confirm(`${status.toUpperCase()} ${scope}\nCity: ${cityId}\nTarget: ${target}\nReason (public): ${reason.trim()}\n\nHide/unhide changes visibility, not cancellation. Suspension stops new publication, not existing history. Independent external copies may remain. Continue?`))return;
  setMessage("Approve the moderation signature in your signer…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();
  const recheck=latestEventModerations(await queryEventModerations(relayConfig.writeRelays,cityId)).find(r=>moderationKey(r.decision)===`${scope}:${target}`);if(recheck?.event.id!==current?.event.id)throw new Error("Moderation changed while signing. Nothing published; reload.");
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
  const saved=latestEventModerations(await queryEventModerations(relayConfig.writeRelays,cityId)).find(r=>moderationKey(r.decision)===`${scope}:${target}`);if(saved?.event.id!==signed.id)throw new Error("Relay acknowledged but latest decision not confirmed. Reload before retrying.");
  await load(cityId);setReason("");setMessage(`${status}: signed decision confirmed by relay read-back. Existing cancellation and city disapproval still apply.`);
 });}
 return <section><h2>Walk visibility and publishing</h2><p>These controls preserve signed events, ownership and history. Replicated cities are blocked until their receivers support these decisions. Do not use cancellation as a substitute for hide/unhide.</p>
 <label>City <select disabled={busy} value={cityId} onChange={e=>{const id=e.target.value;setCityId(id);setReason("");if(id)void run(()=>load(id));else{setEvents([]);setRecords([]);}}}><option value="">Select a city</option>{cities.map(c=><option key={c.id} value={c.id}>{dashboard.cities.find(d=>d.id===c.id)?.name??c.id}</option>)}</select></label>
 <button disabled={busy||!cityId} onClick={()=>run(()=>load(cityId))}>Refresh moderation</button><p role="status">{message}</p>
 {cityId&&<><h3>Publishing suspension</h3><p>City publishing: {head("city",cityId)?.decision.status??"active"}</p>
 <label><strong>Reason for the next moderation action</strong><textarea value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Required. This reason becomes part of the public signed audit history." aria-describedby="moderation-reason-help"/></label>
 <p id="moderation-reason-help"><small>Enter a public reason to enable the city suspension, resume, hide or unhide buttons. Organizer-wide publishing access is managed in the Organizers module.</small></p>
 <button disabled={busy||!reason.trim()} onClick={()=>decide("city",cityId,head("city",cityId)?.decision.status==="suspended"?"active":"suspended")}>{head("city",cityId)?.decision.status==="suspended"?"Resume city publishing":"Suspend city publishing"}</button>
 <h3>Visible walks ({events.length})</h3>{events.map(event=><div key={event.id}><p>{event.tags.find(t=>t[0]==="title")?.[1]} — {new Date(Number(event.tags.find(t=>t[0]==="start")?.[1])*1000).toLocaleString()}<br/><small>{event.id}</small></p><button disabled={busy||!reason.trim()} onClick={()=>decide("event",walkAddress(event),"hidden",event.id)}>Hide this walk</button></div>)}
 <h3>Hidden walk addresses</h3>{heads.filter(r=>r.decision.scope==="event"&&r.decision.status==="hidden").map(r=><div key={r.event.id}><p style={{overflowWrap:"anywhere"}}>{r.decision.target}<br/>{r.decision.reason}</p><button disabled={busy||!reason.trim()} onClick={()=>decide("event",r.decision.target,"visible",r.decision.eventId)}>Unhide walk</button></div>)}
 <details><summary>Signed decision history ({records.length})</summary>{records.map(r=><p key={r.event.id} style={{overflowWrap:"anywhere"}}>{r.decision.scope}: {r.decision.status} — {r.decision.reason}<br/>{r.event.id}</p>)}</details></>}
 </section>;
}
