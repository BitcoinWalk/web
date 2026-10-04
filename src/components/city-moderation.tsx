"use client";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import {useRef,useState} from "react";
import {nip19,type Event} from "nostr-tools";
import AdminCityLink from "./admin-city-link";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig} from "../lib/directory-config";
import {queryDirectoryRecords,queryCalendarEvents,queryCalendarDeletion} from "../nostr/city-records";
import {managedCities,ARCHIVE_NOTE,assertExactSigned,createCalendarDeletion,createCityModerationDecision,type ManagedCity} from "../nostr/moderation";
import {getBrowserExtensionPubkey,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {calendarNevent,approvedCalendarWalks,type CalendarWalk} from "../nostr/calendar-records";
import {eventPageHref,managedCalendarEvents,type ManagedCalendarEvent} from "../domain/event-routing";
import {publishVerifiedEvent} from "../nostr/relay";
import {requireOccurrenceCancellationRelay} from "../nostr/relay-capabilities";
import CityFinder from "./city-finder";
import WalkIdentifiers from "./walk-identifiers";
import {paymentFetch,signPayment,type LogoPackView} from "./city-payment";

export default function CityModeration(){
 const dashboard=useDashboard();
 useDashboardAutoLoad(()=>run(async()=>{await reload();setMessage("City list loaded. Select a city to review its state and walks.");}));
 const [pastCities,setPastCities]=useState<Set<string>>(new Set());
 const [logoPacks,setLogoPacks]=useState<LogoPackView[]>([]);
 const [selectedId,setSelectedId]=useState(dashboard.selectedCity);
 const [calendarWalks,setCalendarWalks]=useState<CalendarWalk[]>([]);
 const lock=useRef(false);const [busy,setBusy]=useState(false),[rows,setRows]=useState<ManagedCity[]>([]),[events,setEvents]=useState<Event[]>([]),[message,setMessage]=useState("Loading cities…");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Select the BitcoinWalk super-admin in your extension.");}
 async function records(){const r=await queryDirectoryRecords(relayConfig.writeRelays);setCalendarWalks(approvedCalendarWalks(r.revisions,r.approvals));return managedCities(r.revisions,r.approvals);}
 async function reload(cityId=selectedId){setRows([]);setEvents([]);const r=await records();const e=cityId?await queryCalendarEvents(relayConfig.writeRelays,{cityId}):[];if(e.length>=500)throw new Error("This city's event read limit was reached. Ask an administrator to review its history.");await admin();const pubkey=await getBrowserExtensionPubkey(),logoResult=await signPayment({action:"list"},pubkey).then(paymentFetch).catch(()=>null);setRows(r);setEvents(e);setLogoPacks(logoResult?.logoPacks??[]);}
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(e){setMessage(e instanceof Error?e.message:"Operation failed. Reload before retrying.");}finally{lock.current=false;setBusy(false);}}
 async function current(row:ManagedCity){const found=(await records()).find(r=>r.revision.city.cityId===row.revision.city.cityId);if(!found||found.head!==row.head)throw new Error("City decisions changed. Reload before continuing.");return found;}
 async function decide(row:ManagedCity,action:"approve"|"disapprove"|"archive"){
  setMessage("Checking signer and current city decision…");
  await run(async()=>{const city=row.revision.city;const latest=await current(row);
   if(action==="archive"&&directoryConfig.paidCities[city.cityId])throw new Error("Paid-relay deletion is disabled until verified infrastructure inventory and recovery are ready.");
   const warning=action==="approve"?`Approve ${city.cityName}, revision ${row.revision.event.id}? This restores its public events but does not publish a new occurrence.`:action==="archive"?`${ARCHIVE_NOTE}\nCity: ${city.cityName} (${city.cityId}).\nConfirm this is a FREE-tier city. This does not delete any VPS, chat or dedicated relay.`:`Disapprove ${city.cityName}? Hide this city and all its events from public views. Ownership and history remain; external copies may remain.`;
   if(action==="archive"?window.prompt(`${warning}\nType the city slug '${city.slug}' to archive:`)!==city.slug:!window.confirm(warning)){setMessage("Cancelled. No change published.");return;}
   const template=createCityModerationDecision(latest,action);
   setMessage("Review the decision warning in your extension and sign…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
   await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
   const readback=await records(),saved=readback.find(r=>r.revision.city.cityId===city.cityId);if(saved?.decision.event.id!==signed.id)throw new Error("Decision acknowledged but current state not confirmed. Reload before retrying.");
   await reload(city.cityId);setSelectedId(city.cityId);setMessage(`${city.cityName}: ${saved.state}. Confirmed by relay read-back. No relay infrastructure was deleted.`);
  });
 }
 async function removeEvent(row:ManagedCity,item:ManagedCalendarEvent){await run(async()=>{
  await requireOccurrenceCancellationRelay(relayConfig.writeRelays);
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
 function eventRow(row:ManagedCity,item:ManagedCalendarEvent){const city=row.revision.city,nevent=calendarNevent(item.event,relayConfig.calendarRelayHints),href=eventPageHref(city.slug,nevent),when=new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000));return <li key={item.event.id}><p><strong>{item.status==="active"?"Active":item.status==="grace"?"Late-arrival grace":item.status==="upcoming"?"Upcoming":"Past"}</strong> — {when}<br/>{item.meetingPoint.description}<br/><WalkIdentifiers organizerNpub={nip19.npubEncode(item.event.pubkey)} nevent={nevent}/></p><p><a href={href} target="_blank" rel="noreferrer">Open event ↗</a>{" "}<button disabled={busy} onClick={()=>removeEvent(row,item)}>Cancel this walk</button></p></li>;}
 const scoped=rows.filter(row=>!dashboard.selectedCity||row.revision.city.cityId===dashboard.selectedCity),available=scoped.filter(row=>row.state!=="archived"),archived=scoped.filter(row=>row.state==="archived");
 function selectCity(id:string){setSelectedId(id);void run(async()=>{await reload(id);setMessage(id?"City state and walks loaded.":"City list loaded.");});}
 return <section>
  <h2>City list</h2>
  <p>Select a city to review its state and published walks. Disapproval is reversible; archiving a free-tier city preserves its history. Paid-relay deletion is not enabled.</p>
  <button disabled={busy} onClick={()=>run(async()=>{await reload();setMessage("City state and selected city's walks refreshed.");})}>Refresh cities</button>
  <CityFinder disabled={busy} value={available.some(row=>row.revision.city.cityId===selectedId)?selectedId:""} onChange={selectCity} items={available.map(row=>({id:row.revision.city.cityId,name:row.revision.city.cityName,meta:row.state,keywords:[row.revision.city.slug,row.revision.city.cityId]}))}/>
  <details><summary><strong>Archived cities ({archived.length})</strong></summary><div><p>Archived cities are hidden from public and organizer active views. Select one here to review or restore it.</p>{archived.length?<CityFinder disabled={busy} label="Archived city" placeholder="Search archived cities…" value={archived.some(row=>row.revision.city.cityId===selectedId)?selectedId:""} onChange={selectCity} items={archived.map(row=>({id:row.revision.city.cityId,name:row.revision.city.cityName,meta:"archived",keywords:[row.revision.city.slug,row.revision.city.cityId]}))}/>:<p>No archived cities.</p>}</div></details>
  <p role="status">{message}</p>
  {scoped.filter(row=>row.revision.city.cityId===selectedId).map(row=>{const city=row.revision.city,paid=!!directoryConfig.paidCities[city.cityId],logo=logoPacks.find(pack=>pack.cityId===city.cityId&&pack.revisionId===row.revision.event.id),walk=calendarWalks.find(w=>w.revision.city.cityId===city.cityId),items=walk?managedCalendarEvents(walk,events):[],currentItems=items.filter(item=>item.status!=="past"),past=items.filter(item=>item.status==="past"),showPast=pastCities.has(city.cityId);return <article key={city.cityId}><h3>{city.cityName} — {row.state}</h3><AdminCityLink city={city} approved={row.state==="approved"}/><p>City ID: {city.cityId}<br/>Revision: {row.revision.event.id}</p><p>Logo pack: {logo?`${logo.state} · ${logo.attempts} attempt${logo.attempts===1?"":"s"} · ${logo.publiclyListed?"Pro link visible":"direct link unlisted"}`:"No durable job"}{logo?.href&&<> · <a href={logo.href} target="_blank" rel="noreferrer">Open pack</a></>}</p><button disabled={busy||row.state==="approved"} onClick={()=>decide(row,"approve")}>Approve / Restore</button>{" "}<button disabled={busy||row.state!=="approved"} onClick={()=>decide(row,"disapprove")}>Disapprove</button>{" "}<button disabled={busy||paid||row.state==="archived"} onClick={()=>decide(row,"archive")}>{paid?"Delete paid relay — unavailable":"Delete — archive free city"}</button><p role="status" style={{fontWeight:600}}>{message}</p><h4>Published occurrences ({items.length})</h4>{!items.length?<p>{row.state!=="approved"?"This city's events are hidden while it is disapproved or archived. Use Approve / Restore above to restore approval; no new occurrence is created.":"No public events."}</p>:<><ol>{currentItems.map(item=>eventRow(row,item))}</ol>{!!past.length&&<><button disabled={busy} onClick={()=>setPastCities(previous=>{const next=new Set(previous);if(showPast)next.delete(city.cityId);else next.add(city.cityId);return next;})}>{showPast?"Hide":`Show ${past.length}`} past event{past.length===1?"":"s"}</button>{showPast&&<ol>{past.map(item=>eventRow(row,item))}</ol>}</>}</>}<p>{paid?"Verified paid configuration: infrastructure operations are disabled.":"Tier inventory is incomplete: archive requires confirmation that this is a free-tier city; it never deletes infrastructure."}</p></article>;})}
 </section>;
}
