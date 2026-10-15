"use client";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {nip19,type Event} from "nostr-tools";
import AdminCityLink from "./admin-city-link";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig,stagingTestCityIds} from "../lib/directory-config";
import {queryDirectoryRecords,queryCalendarEvents,queryCalendarDeletion,type CityRevision} from "../nostr/city-records";
import {managedCities,needsChangesCities,archivedCityIds,ARCHIVE_NOTE,TEST_CITY_ARCHIVE_NOTE,assertExactSigned,createCalendarDeletion,createCityModerationDecision,createCityPresentationDecision,createNeedsChangesArchiveDecision,type ManagedCity,type NeedsChangesCity} from "../nostr/moderation";
import {clearDashboardAuthorizationScope,getBrowserExtensionPubkey,setDashboardAuthorizationScope,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {calendarNevent,approvedCalendarWalks,type CalendarWalk} from "../nostr/calendar-records";
import {eventPageHref,managedCalendarEvents,type ManagedCalendarEvent} from "../domain/event-routing";
import {publishVerifiedEvent} from "../nostr/relay";
import {requireOccurrenceCancellationRelay} from "../nostr/relay-capabilities";
import CityFinder from "./city-finder";
import WalkIdentifiers from "./walk-identifiers";
import {paymentFetch,signPayment,type LogoPackView} from "./city-payment";
import EventModerationPanel from "./event-moderation";
import {CityIdentityHealthDetails,identityHealthLabel} from "./city-identity-health";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";
import AdminDataStatus,{resolvedAdminDataState,type AdminDataHealth} from "./admin-data-status";
import {cityRelayLabel,cityWorkflowActions,cityWorkflowLabel,cityWorkflowNextStep,cityWorkflowRows,type CityWorkflowAction,type CityWorkflowRow,type CityWorkflowStatus} from "./city-backlog";
import CityActionsMenu from "./city-actions-menu";
import styles from "./city-moderation.module.css";
import {adminCityRequests} from "../domain/admin-city-requests";

const authorizationScope="cities";

export default function CityModeration(){
 const dashboard=useDashboard();
 useDashboardAutoLoad(()=>run(async()=>{await reload();setMessage("City list loaded. Select a city to review its state and walks.");}));
 const [pastCities,setPastCities]=useState<Set<string>>(new Set());
 const [logoPacks,setLogoPacks]=useState<LogoPackView[]>([]);
 const [needsChanges,setNeedsChanges]=useState<NeedsChangesCity[]>([]);
 const [pending,setPending]=useState<CityRevision[]>([]);
 const [rejected,setRejected]=useState<CityRevision[]>([]);
 const [paidCityIds,setPaidCityIds]=useState<Set<string>>(new Set());
 const [paymentInventoryReady,setPaymentInventoryReady]=useState(false);
 const [identityHealth,setIdentityHealth]=useState<CityIdentityHealth[]>([]);
 const [identityHealthError,setIdentityHealthError]=useState("");
 const [selectedId,setSelectedId]=useState(dashboard.selectedCity);
 const [query,setQuery]=useState("");
 const [statusFilter,setStatusFilter]=useState<"all"|CityWorkflowStatus>("all");
 const scrollToCity=useRef("");
 const [calendarWalks,setCalendarWalks]=useState<CalendarWalk[]>([]);
 const [publicUrls,setPublicUrls]=useState<Record<string,string>>({});
 const [publicAliases,setPublicAliases]=useState<Record<string,string>>({});
 const [dataHealth,setDataHealth]=useState<AdminDataHealth>({state:"loading",message:"Loading the city directory and operational checks…"});
 const lock=useRef(false);const [busy,setBusy]=useState(false),[rows,setRows]=useState<ManagedCity[]>([]),[events,setEvents]=useState<Event[]>([]),[message,setMessage]=useState("Loading cities…");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Select the BitcoinWalk super-admin in your extension.");}
 async function records(){const directory=await queryDirectoryRecords(relayConfig.writeRelays),applications=adminCityRequests(directory.revisions,directory.approvals);return {rows:managedCities(directory.revisions,directory.approvals),calendarWalks:approvedCalendarWalks(directory.revisions,directory.approvals),needsChanges:applications.filter(row=>row.status==="needs-changes"&&row.decision).map(row=>({revision:row.revision,rejection:row.decision!})),pending:applications.filter(row=>row.status==="pending").map(row=>row.revision),rejected:applications.filter(row=>row.status==="rejected").map(row=>row.revision)};}
 async function reload(cityId=selectedId){
  const hadData=rows.length>0;
  const retainedOperationalData=paymentInventoryReady||logoPacks.length>0||identityHealth.length>0;
  setDashboardAuthorizationScope(authorizationScope,false);
  setDataHealth(current=>({state:"loading",message:"Refreshing cities without clearing the current view or unsaved URL edits…",checkedAt:current.checkedAt}));
  try{
   const snapshot=await records(),nextEvents=cityId?await queryCalendarEvents(relayConfig.writeRelays,{cityId}):[];
   if(nextEvents.length>=500)throw new Error("This city's event read limit was reached. Ask an administrator to review its history.");
   await admin();const pubkey=await getBrowserExtensionPubkey(),logoResult=await signPayment({action:"list"},pubkey).then(paymentFetch).catch(()=>null);
   setRows(snapshot.rows);setCalendarWalks(snapshot.calendarWalks);setNeedsChanges(snapshot.needsChanges);setPending(snapshot.pending);setRejected(snapshot.rejected);setEvents(nextEvents);
   if(logoResult){setLogoPacks(logoResult.logoPacks??[]);setPaidCityIds(new Set((logoResult.payments??[]).filter(payment=>payment.tier==="paid").map(payment=>payment.cityId)));setIdentityHealth(logoResult.identityHealth??[]);setIdentityHealthError(logoResult.identityHealthError??"");setPaymentInventoryReady(true);}
   else {setPaymentInventoryReady(false);setIdentityHealthError("City identity and payment checks could not be refreshed. Their last-known results remain visible, and changes are paused until Retry succeeds.");}
   const checkedAt=new Date().toISOString(),state=resolvedAdminDataState({incomplete:!logoResult,retainedData:!logoResult&&retainedOperationalData,hasFreshData:true,visibleCount:snapshot.rows.length});setDashboardAuthorizationScope(authorizationScope,!!logoResult);
   setDataHealth({state,message:logoResult?(snapshot.rows.length?`${snapshot.rows.length} cities and the selected city's walks were checked successfully.`:"No cities were returned by the verified directory."):retainedOperationalData?"The city directory is current, but identity and payment checks are showing last-known results. Changes are paused until Retry succeeds.":"The city directory is current, but identity and payment checks are unavailable. Changes are paused until Retry succeeds.",checkedAt});
  }catch(error){setDashboardAuthorizationScope(authorizationScope,false);const checkedAt=new Date().toISOString(),detail=error instanceof Error?error.message:"City data could not be loaded.",state=resolvedAdminDataState({incomplete:true,retainedData:hadData,hasFreshData:false,visibleCount:rows.length});setDataHealth({state,message:hadData?`${detail} Last-known cities and unsaved URL edits remain visible; changes are paused.`:detail,checkedAt});throw error;}
 }
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(e){setMessage(e instanceof Error?e.message:"Operation failed. Reload before retrying.");}finally{lock.current=false;setBusy(false);}}
 async function current(row:ManagedCity){const found=(await records()).rows.find(r=>r.revision.city.cityId===row.revision.city.cityId);if(!found||found.head!==row.head)throw new Error("City decisions changed. Reload before continuing.");return found;}
 async function decide(row:ManagedCity,action:"approve"|"disapprove"|"archive"|"retire-test"){
  setMessage("Checking signer and current city decision…");
  await run(async()=>{const city=row.revision.city;const latest=await current(row);
   if(action==="archive"&&(directoryConfig.paidCities[city.cityId]||paidCityIds.has(city.cityId)))throw new Error("Paid-relay deletion is disabled until verified infrastructure inventory and recovery are ready.");
   if(action==="retire-test"&&!stagingTestCityIds.has(city.cityId))throw new Error("Only an exact staging test fixture can use this retirement action.");
   const warning=action==="approve"?`Approve ${city.cityName}, revision ${row.revision.event.id}? This restores its public events but does not publish a new occurrence.`:action==="archive"?`${ARCHIVE_NOTE}\nCity: ${city.cityName} (${city.cityId}).\nConfirm this is a FREE-tier city. This does not delete any VPS, chat or dedicated relay.`:action==="retire-test"?`${TEST_CITY_ARCHIVE_NOTE}\nCity: ${city.cityName} (${city.cityId}).\nThis removes the fixture from active staging lists without changing production.`:`Unpublish ${city.cityName}? Hide this city and all its events from public views. Ownership and history remain; external copies may remain.`;
   if(action==="archive"||action==="retire-test"?window.prompt(`${warning}\nType the city slug '${city.slug}' to continue:`)!==city.slug:!window.confirm(warning)){setMessage("Cancelled. No change published.");return;}
   const template=createCityModerationDecision(latest,action);
   setMessage("Review the decision warning in your extension and sign…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
   await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
   const readback=await records(),saved=readback.rows.find(r=>r.revision.city.cityId===city.cityId);if(saved?.decision.event.id!==signed.id)throw new Error("Decision acknowledged but current state not confirmed. Reload before retrying.");
   await reload(city.cityId);setSelectedId(city.cityId);setMessage(`${city.cityName}: ${saved.state}. Confirmed by relay read-back. No relay infrastructure was deleted.`);
  });
 }
 async function archiveRejectedTests(){await run(async()=>{
  if(!paymentInventoryReady)throw new Error("Payment inventory is unavailable. Refresh cities before archiving anything.");
  const blocked=needsChanges.filter(row=>paidCityIds.has(row.revision.city.cityId)||!!directoryConfig.paidCities[row.revision.city.cityId]);
  if(blocked.length)throw new Error(`Paid or relay-backed cities require individual review: ${blocked.map(row=>row.revision.city.cityName).join(", ")}. Nothing was archived.`);
  const names=needsChanges.map(row=>row.revision.city.cityName);
  if(!names.length){setMessage("No Awaits change cities remain to archive.");return;}
  if(!window.confirm(`Archive all ${names.length} eligible Awaits change cities?\n\n${names.join("\n")}\n\nEach city requires a super-admin signature. History is retained and no infrastructure is deleted.`)){setMessage("Cancelled. No city was archived.");return;}
  const completed:string[]=[];
  for(const row of needsChanges){
   const directory=await queryDirectoryRecords(relayConfig.writeRelays),latest=needsChangesCities(directory.revisions,directory.approvals).find(item=>item.revision.city.cityId===row.revision.city.cityId&&item.revision.event.id===row.revision.event.id&&item.rejection.event.id===row.rejection.event.id);
   if(!latest)throw new Error(`${completed.length} ${completed.length===1?"city was":"cities were"} archived, then ${row.revision.city.cityName} changed. Reload before continuing.`);
   const template=createNeedsChangesArchiveDecision(latest);setMessage(`Sign archive ${completed.length+1} of ${needsChanges.length}: ${row.revision.city.cityName}`);
   const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();
   await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
   const readback=await queryDirectoryRecords(relayConfig.writeRelays);if(!archivedCityIds(readback.approvals).has(row.revision.city.cityId))throw new Error(`${row.revision.city.cityName} was acknowledged but archive read-back failed. Stop and reload.`);
   completed.push(row.revision.city.cityName);
  }
  await reload();setMessage(`${completed.length} Awaits change ${completed.length===1?"city":"cities"} archived and verified: ${completed.join(", ")}. No infrastructure was deleted.`);
 });}
 async function archiveAwaitingCity(row:NeedsChangesCity){await run(async()=>{
  if(!paymentInventoryReady)throw new Error("Payment inventory is unavailable. Refresh cities before archiving anything.");
  const city=row.revision.city;if(paidCityIds.has(city.cityId)||!!directoryConfig.paidCities[city.cityId])throw new Error("Paid or relay-backed cities cannot be archived from the city queue.");
  const latest=(await records()).needsChanges.find(item=>item.revision.event.id===row.revision.event.id&&item.rejection.event.id===row.rejection.event.id);
  if(!latest)throw new Error("This request changed. Reload before archiving it.");
  if(window.prompt(`${ARCHIVE_NOTE}\nCity: ${city.cityName} (${city.cityId}).\nType the city slug '${city.slug}' to continue:`)!==city.slug){setMessage("Cancelled. No change published.");return;}
  const template=createNeedsChangesArchiveDecision(latest);setMessage("Review the archive decision in your extension and sign…");
  const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
  const readback=await queryDirectoryRecords(relayConfig.writeRelays);if(!archivedCityIds(readback.approvals).has(city.cityId))throw new Error("Archive acknowledged but relay read-back failed. Reload before retrying.");
  await reload();setMessage(`${city.cityName} archived. Signed history remains and no infrastructure was deleted.`);
 });}
 async function removeEvent(row:ManagedCity,item:ManagedCalendarEvent){await run(async()=>{
  await requireOccurrenceCancellationRelay(relayConfig.writeRelays);
  await current(row);const live=await queryCalendarEvents(relayConfig.writeRelays,{ids:[item.event.id]});if(!live.some(e=>e.id===item.event.id&&e.pubkey===item.event.pubkey))throw new Error("This exact occurrence is no longer public. Reload before deleting.");
  const city=row.revision.city,template=createCalendarDeletion(item.event,city.cityId);
  const when=new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000));
  if(!window.confirm(`${template.content}\n\nCity: ${city.cityName}\nOccurrence: ${when}\nMeeting point: ${item.meetingPoint.description}\nHost: ${nip19.npubEncode(item.event.pubkey)}\n\nThis removes only this occurrence. If it is selected by the city URL, that URL will rotate to the next event.`)){setMessage("Cancelled. Nothing deleted.");return;}
  setMessage("Review the exact occurrence deletion and sign in your extension…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);setMessage("Deletion acknowledged. Verifying tombstone and exact event removal…");
  const tombstones=await queryCalendarDeletion(relayConfig.writeRelays,item.event.id),remaining=await queryCalendarEvents(relayConfig.writeRelays,{ids:[item.event.id]});
  if(!tombstones.some(e=>e.id===signed.id)||remaining.length)throw new Error("Deletion acknowledged but exact removal not confirmed. Reload before retrying.");
  await reload();setMessage(`${city.cityName}: occurrence removed and tombstone verified. The city URL will select the next eligible walk. External copies may remain.`);
 });}
 async function savePublicUrl(row:ManagedCity){await run(async()=>{
  const latest=await current(row),city=row.revision.city,currentSlug=row.decision.approval.slug??city.slug;
  const slug=(publicUrls[city.cityId]??currentSlug).trim().toLowerCase(),aliases=(publicAliases[city.cityId]??(row.decision.approval.aliases??city.aliases??[]).join(", ")).split(",").map(value=>value.trim()).filter(Boolean);
  if(!window.confirm(`Change the canonical city URL?\n\nCurrent: https://bitcoinwalk.org/${currentSlug}\nNew: https://bitcoinwalk.org/${slug}\n\nLegacy aliases: ${aliases.join(", ")||"none"}\nFuture paid-city relay: wss://${slug}.bitcoinwalk.org/\n\nThe signed host revision and walks will not change.`)){setMessage("Cancelled. Nothing published.");return;}
  const template=createCityPresentationDecision(latest,slug,aliases);
  setMessage("Review and sign the exact public URL change in your extension…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
  await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
  const readback=await records(),saved=readback.rows.find(item=>item.revision.city.cityId===city.cityId);if(saved?.decision.event.id!==signed.id)throw new Error("URL change acknowledged but current state was not confirmed. Reload before retrying.");
  setPublicUrls(value=>({...value,[city.cityId]:slug}));setPublicAliases(value=>({...value,[city.cityId]:aliases.join(", ")}));await reload(city.cityId);setSelectedId(city.cityId);setMessage(`${city.cityName}: canonical URL is now /${slug}. Previous spellings remain redirects.`);
 });}
 function eventRow(row:ManagedCity,item:ManagedCalendarEvent){const city=row.revision.city,nevent=calendarNevent(item.event,relayConfig.calendarRelayHints),href=eventPageHref(city.slug,nevent),when=new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000));return <li key={item.event.id}><p><strong>{item.status==="active"?"Active":item.status==="grace"?"Late-arrival grace":item.status==="upcoming"?"Upcoming":"Past"}</strong> — {when}<br/>{item.meetingPoint.description}<br/><WalkIdentifiers organizerNpub={nip19.npubEncode(item.event.pubkey)} nevent={nevent}/></p><p><a href={href} target="_blank" rel="noreferrer">Open event ↗</a>{" "}<button disabled={busy||!dataCurrent} onClick={()=>removeEvent(row,item)}>Cancel this walk</button></p></li>;}
 const dataCurrent=dataHealth.state==="ready"||dataHealth.state==="empty";
 const scoped=rows,available=scoped.filter(row=>row.state!=="archived");
 const workflow=cityWorkflowRows({managed:rows,pending,needsChanges,rejected,health:identityHealth,paidCityIds,paidCities:directoryConfig.paidCities});
 const normalizedQuery=query.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
 const visibleWorkflow=workflow.filter(item=>(statusFilter==="all"||item.status===statusFilter)&&(!normalizedQuery||`${item.cityName} ${item.slug} ${item.cityId}`.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().includes(normalizedQuery)));
 const statusCounts=workflow.reduce<Record<CityWorkflowStatus,number>>((counts,item)=>({...counts,[item.status]:counts[item.status]+1}),{"action-required":0,"awaits-change":0,online:0,offline:0});
 function selectCity(id:string){setSelectedId(id);void run(async()=>{await reload(id);setMessage(id?"City state and walks loaded.":"City list loaded.");});}
 function reviewCity(id:string){scrollToCity.current=id;selectCity(id);}
 function cityAction(item:CityWorkflowRow,action:CityWorkflowAction){
  const menuItem={role:"menuitem" as const};
  if(action==="open-record")return <button {...menuItem} disabled={busy} onClick={()=>reviewCity(item.cityId)}>Open city</button>;
  if(action==="open-public"){const href=item.health&&!item.health.availableInEnvironment?`https://bitcoinwalk.org/${item.slug}`:`/${item.slug}`;return <a {...menuItem} href={href} target="_blank" rel="noreferrer">Open public page <span aria-hidden="true">↗</span></a>;}
  if(action==="review-request"){const id=item.pending?.event.id??item.needsChanges?.revision.event.id;return <Link {...menuItem} href={`/admin/requests#submission-${id}`}>{item.source==="pending"?"Review application":"Review requested changes"}</Link>;}
  if(action==="view-decision")return <Link {...menuItem} href={`/admin/requests#submission-${item.rejected!.event.id}`}>View final decision</Link>;
  if(action==="manage-pro")return <Link {...menuItem} href={`/admin/upgrade?city=${encodeURIComponent(item.cityId)}`}>Continue Pro setup</Link>;
  if(action==="set-online")return <button {...menuItem} disabled={busy||!dataCurrent} onClick={()=>decide(item.managed!,"approve")}>Set online</button>;
  if(action==="set-offline")return <button {...menuItem} disabled={busy||!dataCurrent} onClick={()=>decide(item.managed!,"disapprove")}>Set offline</button>;
  if(action==="retire-test")return <button {...menuItem} disabled={busy||!dataCurrent} onClick={()=>decide(item.managed!,"retire-test")}>Retire test city</button>;
  return <button {...menuItem} className={styles.destructiveMenuItem} disabled={busy||!dataCurrent||!paymentInventoryReady} onClick={()=>item.managed?decide(item.managed,"archive"):archiveAwaitingCity(item.needsChanges!)}>Archive city</button>;
 }
 useEffect(()=>()=>clearDashboardAuthorizationScope(authorizationScope),[]);
 useEffect(()=>{const cityId=scrollToCity.current;if(!cityId||!rows.some(row=>row.revision.city.cityId===cityId))return;scrollToCity.current="";requestAnimationFrame(()=>document.getElementById(`city-admin-${cityId}`)?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"}));},[rows]);
 return <section>
  <div className={styles.sectionHeading}><div><h2>Cities</h2><p>One operational backlog for every city. Work owned by the super-admin appears first, followed by work awaiting a host or provider.</p></div><button disabled={busy} onClick={()=>run(async()=>{await reload();setMessage("City state and selected city's walks refreshed.");})}>Refresh cities</button></div>
  <AdminDataStatus health={dataHealth} busy={busy} onRetry={()=>void run(async()=>{await reload(selectedId);setMessage("City state and selected city's walks refreshed.");})} scope="Cities"/>
  <div className={styles.summary} aria-label="City status totals"><span className={styles.count}>Action required {statusCounts["action-required"]}</span><span className={styles.count}>Awaits change {statusCounts["awaits-change"]}</span><span className={styles.count}>Online {statusCounts.online}</span><span className={styles.count}>Offline {statusCounts.offline}</span></div>
  <CityFinder disabled={busy} label="Jump to city" placeholder="Find a city…" value="" onChange={reviewCity} items={available.map(row=>({id:row.revision.city.cityId,name:row.revision.city.cityName,meta:`${row.state} · ${identityHealthLabel(identityHealth.find(item=>item.cityId===row.revision.city.cityId))}`,keywords:[row.revision.city.slug,row.revision.city.cityId]}))}/>
  <div className={styles.toolbar}><label>Filter cities<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name, slug or city ID"/></label><label>Status<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="action-required">Action required</option><option value="awaits-change">Awaits change</option><option value="online">Online</option><option value="offline">Offline</option></select></label></div>
  <ol className={styles.list} aria-label="City operational backlog">{visibleWorkflow.length?visibleWorkflow.map(item=>{const nextStep=cityWorkflowNextStep(item);return <li className={styles.item} key={item.cityId}>
   <div className={styles.row}><div className={styles.identity}><span className={styles.dot} data-online={item.online} role="img" aria-label={item.online?"Online":"Offline"}/><div><strong>{item.cityName}</strong><small>/{item.slug} · {item.cityId}</small></div></div>
   <div className={styles.badges}><span className={styles.badge} data-status={item.status}>{cityWorkflowLabel(item.status)}</span><span className={styles.badge}>{item.tier==="paid"?"Paid":item.tier==="test"?"Test":"Basic"}</span><span className={styles.badge}>{cityRelayLabel(item.relay)}</span></div>
   <CityActionsMenu cityName={item.cityName}>{cityWorkflowActions(item).map(action=><span className={styles.actionMenuItem} key={action}>{cityAction(item,action)}</span>)}</CityActionsMenu></div>
   {nextStep&&<aside className={styles.nextStep} aria-label={`Next action for ${item.cityName}`}><span className={styles.nextStepMark} aria-hidden="true">→</span><p><strong>Next: {nextStep.owner}</strong> — {nextStep.action}{nextStep.helpHref&&<> <a href={nextStep.helpHref} target="_blank" rel="noreferrer">View host instructions <span aria-hidden="true">↗</span></a></>}</p></aside>}
  </li>}):<li className={styles.empty}>No cities match these filters.</li>}</ol>
  {!!identityHealthError&&<p role="alert">{identityHealthError}</p>}
  {!!needsChanges.length&&<details className={styles.bulk}><summary><strong>Archive eligible Awaits change test cities ({needsChanges.length})</strong></summary><p>This cleanup retains signed history and never deletes infrastructure. Paid or relay-backed cities are blocked.</p><button disabled={busy||!dataCurrent||!paymentInventoryReady} onClick={archiveRejectedTests}>Archive eligible cities</button>{!paymentInventoryReady&&<p>Payment inventory must load before this action is enabled.</p>}</details>}
  <p role="status">{message}</p>
  {scoped.filter(row=>row.revision.city.cityId===selectedId).map(row=>{const city=row.revision.city,canonicalSlug=row.decision.approval.slug??city.slug,currentAliases=row.decision.approval.aliases??city.aliases??[],testCity=stagingTestCityIds.has(city.cityId),paid=!!directoryConfig.paidCities[city.cityId]||paidCityIds.has(city.cityId),logo=logoPacks.find(pack=>pack.cityId===city.cityId&&pack.revisionId===row.revision.event.id),walk=calendarWalks.find(w=>w.revision.city.cityId===city.cityId),items=walk?managedCalendarEvents(walk,events):[],currentItems=items.filter(item=>item.status!=="past"),past=items.filter(item=>item.status==="past"),showPast=pastCities.has(city.cityId);return <article className={styles.record} id={`city-admin-${city.cityId}`} key={city.cityId}><h3>{city.cityName} — {row.state}</h3><AdminCityLink city={{...city,slug:canonicalSlug,aliases:currentAliases}} approved={row.state==="approved"}/><p>City ID: {city.cityId}<br/>Revision: {row.revision.event.id}</p><CityIdentityHealthDetails row={identityHealth.find(item=>item.cityId===city.cityId)}/><details><summary><strong>Public URL</strong></summary><div><label>Canonical URL <span>bitcoinwalk.org/</span><input aria-label="Canonical city URL" value={publicUrls[city.cityId]??canonicalSlug} onChange={event=>setPublicUrls(value=>({...value,[city.cityId]:event.target.value}))}/></label><label>Legacy URL aliases <input aria-label="Legacy city URL aliases" value={publicAliases[city.cityId]??currentAliases.join(", ")} onChange={event=>setPublicAliases(value=>({...value,[city.cityId]:event.target.value}))} placeholder="Previous spellings, separated by commas"/></label><p>For a Pro city, the matching relay hostname is <code>{`${publicUrls[city.cityId]??canonicalSlug}.bitcoinwalk.org`}</code>. Existing aliases redirect to the canonical city URL.</p><button disabled={busy||!dataCurrent||row.state!=="approved"} onClick={()=>savePublicUrl(row)}>Sign and save public URL</button></div></details><p>Logo pack: {logo?`${logo.state} · ${logo.attempts} attempt${logo.attempts===1?"":"s"} · ${logo.publiclyListed?"Pro link visible":"direct link unlisted"}`:"No durable job"}{logo?.href&&<> · <a href={logo.href} target="_blank" rel="noreferrer">Open pack</a></>}</p><button disabled={busy||!dataCurrent||row.state==="approved"} onClick={()=>decide(row,"approve")}>Approve / Restore</button>{" "}<button disabled={busy||!dataCurrent||row.state!=="approved"} onClick={()=>decide(row,"disapprove")}>Unpublish city</button>{" "}{testCity?<button disabled={busy||!dataCurrent||row.state==="archived"} onClick={()=>decide(row,"retire-test")}>Retire staging test city</button>:<button disabled={busy||!dataCurrent||paid||row.state==="archived"} onClick={()=>decide(row,"archive")}>{paid?"Delete paid relay — unavailable":"Delete — archive free city"}</button>}<p role="status" style={{fontWeight:600}}>{message}</p><EventModerationPanel scope="city" fixedCityId={city.cityId} cityName={city.cityName}/><h4>Published occurrences ({items.length})</h4>{!items.length?<p>{row.state!=="approved"?"This city's events are hidden while it is unpublished or archived. Use Approve / Restore above to restore approval; no new occurrence is created.":"No public events."}</p>:<><ol>{currentItems.map(item=>eventRow(row,item))}</ol>{!!past.length&&<><button disabled={busy} onClick={()=>setPastCities(previous=>{const next=new Set(previous);if(showPast)next.delete(city.cityId);else next.add(city.cityId);return next;})}>{showPast?"Hide":`Show ${past.length}`} past event{past.length===1?"":"s"}</button>{showPast&&<ol>{past.map(item=>eventRow(row,item))}</ol>}</>}</>}<p>{testCity?"Staging test fixture: retirement preserves its signed and isolated payment evidence without changing production.":paid?"Verified paid configuration: infrastructure operations are disabled.":"Tier inventory is incomplete: archive requires confirmation that this is a free-tier city; it never deletes infrastructure."}</p></article>;})}
 </section>;
}
