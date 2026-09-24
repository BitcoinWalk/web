"use client";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import {useRef,useState} from "react";
import {nip19,type Event} from "nostr-tools";
import AdminCityLink from "./admin-city-link";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig} from "../lib/directory-config";
import {queryDirectoryRecords,queryCalendarEvents,queryCalendarDeletion} from "../nostr/city-records";
import {managedCities,visibleManagedCities,ARCHIVE_NOTE,assertExactSigned,createCalendarDeletion,type ManagedCity} from "../nostr/moderation";
import {createApprovalEvent} from "../nostr/city-event";
import {getBrowserExtensionPubkey,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {calendarNevent} from "../nostr/calendar-records";
import {eventPageHref,managedCalendarEvents,type ManagedCalendarEvent} from "../domain/event-routing";
import {publishVerifiedEvent} from "../nostr/relay";

export default function CityModeration(){
 const dashboard=useDashboard();
 useDashboardAutoLoad(()=>run(async()=>{await reload();setMessage("City list loaded. Select a city to review its state and walks.");}));
 const [showArchived,setShowArchived]=useState(false),[pastCities,setPastCities]=useState<Set<string>>(new Set());
 const [selectedId,setSelectedId]=useState(dashboard.selectedCity);
 const lock=useRef(false);const [busy,setBusy]=useState(false),[rows,setRows]=useState<ManagedCity[]>([]),[events,setEvents]=useState<Event[]>([]),[message,setMessage]=useState("Loading cities…");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Select the BitcoinWalk super-admin in your extension.");}
 async function records(){const r=await queryDirectoryRecords(relayConfig.writeRelays);return managedCities(r.revisions,r.approvals);}
 async function reload(cityId=selectedId){setRows([]);setEvents([]);const r=await records();const e=cityId?await queryCalendarEvents(relayConfig.writeRelays,{cityId}):[];if(e.length>=500)throw new Error("This city's event read limit was reached. Ask an administrator to review its history.");await admin();setRows(r);setEvents(e);}
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(e){setMessage(e instanceof Error?e.message:"Operation failed. Reload before retrying.");}finally{lock.current=false;setBusy(false);}}
 async function current(row:ManagedCity){const found=(await records()).find(r=>r.revision.city.cityId===row.revision.city.cityId);if(!found||found.head!==row.head)throw new Error("City decisions changed. Reload before continuing.");return found;}
 async function decide(row:ManagedCity,action:"approve"|"disapprove"|"archive"){
  await run(async()=>{const city=row.revision.city;await current(row);
   if(action==="archive"&&directoryConfig.paidCities[city.cityId])throw new Error("Paid-relay deletion is disabled until verified infrastructure inventory and recovery are ready.");
   const warning=action==="approve"?`Approve ${city.cityName}, revision ${row.revision.event.id}? This restores its public events but does not publish a new occurrence.`:action==="archive"?`${ARCHIVE_NOTE}\nCity: ${city.cityName} (${city.cityId}).\nConfirm this is a FREE-tier city. This does not delete any VPS, chat or dedicated relay.`:`Disapprove ${city.cityName}? Hide this city and all its events from public views. Ownership and history remain; external copies may remain.`;
   if(action==="archive"?window.prompt(`${warning}\nType the city slug '${city.slug}' to archive:`)!==city.slug:!window.confirm(warning)){setMessage("Cancelled. No change published.");return;}
   const template=createApprovalEvent({cityId:city.cityId,cityRevisionId:row.revision.event.id,status:action==="approve"?"approved":"revoked",note:action==="archive"?ARCHIVE_NOTE:action==="approve"?"Restore city approval.":"DISAPPROVE: Hide the city and its calendar from public views; preserve ownership, editors and history."});
   setMessage("Review the decision warning in your extension and sign…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
   await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
   const readback=await records(),saved=readback.find(r=>r.revision.city.cityId===city.cityId);if(saved?.decision.event.id!==signed.id)throw new Error("Decision acknowledged but current state not confirmed. Reload before retrying.");
   await reload(action==="archive"&&!showArchived?"":city.cityId);if(action==="archive"&&!showArchived)setSelectedId("");setMessage(`${city.cityName}: ${saved.state}. Confirmed by relay read-back. No relay infrastructure was deleted.`);
  });
 }
 async function removeEvent(row:ManagedCity,item:ManagedCalendarEvent){await run(async()=>{
  for(const relay of relayConfig.writeRelays){const endpoint=new URL(relay);endpoint.protocol="https:";const response=await fetch(endpoint,{headers:{Accept:"application/nostr+json"},signal:AbortSignal.timeout(5000),cache:"no-store"});if(!response.ok||!["bitcoinwalk-organizers-0.6.0","bitcoinwalk-organizers-0.6.1","bitcoinwalk-organizers-0.7.0","bitcoinwalk-organizers-0.7.1"].includes((await response.json()).version))throw new Error("A compatible organizer occurrence relay is required before cancelling a walk. Nothing signed or cancelled.");}
  await current(row);const live=await queryCalendarEvents(relayConfig.writeRelays,{ids:[item.event.id]});if(!live.some(e=>e.id===item.event.id&&e.pubkey===item.event.pubkey))throw new Error("This exact occurrence is no longer public. Reload before deleting.");
  const city=row.revision.city,template=createCalendarDeletion(item.event,city.cityId);
  const when=new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000));
  if(!window.confirm(`${template.content}\n\nCity: ${city.cityName}\nOccurrence: ${when}\nMeeting point: ${item.meetingPoint.description}\nOrganizer: ${nip19.npubEncode(item.event.pubkey)}\n\nThis removes only this occurrence. If it is selected by the city URL, that URL will rotate to the next event.`)){setMessage("Cancelled. Nothing deleted.");return;}
  setMessage("Review the exact occurrence deletion and sign in your extension…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);setMessage("Deletion acknowledged. Verifying tombstone and exact event removal…");
  const tombstones=await queryCalendarDeletion(relayConfig.writeRelays,item.event.id),remaining=await queryCalendarEvents(relayConfig.writeRelays,{ids:[item.event.id]});
  if(!tombstones.some(e=>e.id===signed.id)||remaining.length)throw new Error("Deletion acknowledged but exact removal not confirmed. Reload before retrying.");
  await reload();setMessage(`${city.cityName}: occurrence removed and tombstone verified. The city URL will select the next eligible walk. External copies may remain.`);
 });}
 function eventRow(row:ManagedCity,item:ManagedCalendarEvent){const city=row.revision.city,nevent=calendarNevent(item.event,relayConfig.readRelays),href=eventPageHref(city.cityId,city.slug,nevent,directoryConfig.paidCities),when=new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000));return <li key={item.event.id}><p><strong>{item.status==="active"?"Active":item.status==="grace"?"Late-arrival grace":item.status==="upcoming"?"Upcoming":"Past"}</strong> — {when}<br/>{item.meetingPoint.description}<br/><small>Organizer: {nip19.npubEncode(item.event.pubkey)}<br/>Event: {item.event.id}</small></p><p><a href={href} target="_blank" rel="noreferrer">Open event ↗</a>{" "}<button disabled={busy} onClick={()=>removeEvent(row,item)}>Cancel this walk</button></p></li>;}
 const available=visibleManagedCities(rows,showArchived).filter(row=>!dashboard.selectedCity||row.revision.city.cityId===dashboard.selectedCity);
 return <section>
  <h2>City list</h2>
  <p>Select a city to review its state and published walks. Disapproval is reversible; archiving a free-tier city preserves its history. Paid-relay deletion is not enabled.</p>
  <button disabled={busy} onClick={()=>run(async()=>{await reload();setMessage("City state and selected city's walks refreshed.");})}>Refresh cities</button>
  <label style={{display:"block",marginTop:"1rem"}}><input type="checkbox" checked={showArchived} onChange={e=>{const next=e.target.checked;setShowArchived(next);if(!next&&rows.some(row=>row.revision.city.cityId===selectedId&&row.state==="archived")){setSelectedId("");setEvents([]);}}}/> Show archived cities</label>
  <label>City <select disabled={busy} value={selectedId} onChange={e=>{const id=e.target.value;setSelectedId(id);void run(async()=>{await reload(id);setMessage(id?"City state and walks loaded.":"City list loaded.");});}}><option value="">Select a city</option>{available.map(row=><option key={row.revision.city.cityId} value={row.revision.city.cityId}>{row.revision.city.cityName} — {row.state}</option>)}</select></label>
  <p role="status">{message}</p>
  {available.filter(row=>row.revision.city.cityId===selectedId).map(row=>{const city=row.revision.city,paid=!!directoryConfig.paidCities[city.cityId],items=managedCalendarEvents({revision:row.revision,approval:row.decision},events),currentItems=items.filter(item=>item.status!=="past"),past=items.filter(item=>item.status==="past"),showPast=pastCities.has(city.cityId);return <article key={city.cityId}><h3>{city.cityName} — {row.state}</h3><AdminCityLink city={city} approved={row.state==="approved"}/><p>City ID: {city.cityId}<br/>Revision: {row.revision.event.id}</p><button disabled={busy||row.state==="approved"} onClick={()=>decide(row,"approve")}>Approve / Restore</button>{" "}<button disabled={busy||row.state!=="approved"} onClick={()=>decide(row,"disapprove")}>Disapprove</button>{" "}<button disabled={busy||paid||row.state==="archived"} onClick={()=>decide(row,"archive")}>{paid?"Delete paid relay — unavailable":"Delete — archive free city"}</button><h4>Published occurrences ({items.length})</h4>{!items.length?<p>No public events.</p>:<><ol>{currentItems.map(item=>eventRow(row,item))}</ol>{!!past.length&&<><button disabled={busy} onClick={()=>setPastCities(previous=>{const next=new Set(previous);if(showPast)next.delete(city.cityId);else next.add(city.cityId);return next;})}>{showPast?"Hide":`Show ${past.length}`} past event{past.length===1?"":"s"}</button>{showPast&&<ol>{past.map(item=>eventRow(row,item))}</ol>}</>}</>}<p>{paid?"Verified paid configuration: infrastructure operations are disabled.":"Tier inventory is incomplete: archive requires confirmation that this is a free-tier city; it never deletes infrastructure."}</p></article>;})}
 </section>;
}
