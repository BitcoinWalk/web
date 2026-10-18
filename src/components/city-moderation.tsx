"use client";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";
import {useEffect,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {nip19,type Event} from "nostr-tools";
import AdminCityLink from "./admin-city-link";
import {relayConfig} from "../lib/relay-config";
import {directoryConfig} from "../lib/directory-config";
import {queryDirectoryRecords,queryCalendarEvents,queryCalendarDeletion,type CityRevision} from "../nostr/city-records";
import {managedCities,needsChangesCities,archivedCityIds,deletedCityIds,ARCHIVE_NOTE,DELETE_CITY_NOTE,assertExactSigned,createCalendarDeletion,createCityDeletionDecision,createCityModerationDecision,createCityPresentationDecision,createNeedsChangesArchiveDecision,type ManagedCity,type NeedsChangesCity} from "../nostr/moderation";
import {clearDashboardAuthorizationScope,getBrowserExtensionPubkey,setDashboardAuthorizationScope,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {calendarNevent,approvedCalendarWalks,type CalendarWalk} from "../nostr/calendar-records";
import {eventPageHref,managedCalendarEvents,type ManagedCalendarEvent} from "../domain/event-routing";
import {publishVerifiedEvent} from "../nostr/relay";
import {requireOccurrenceCancellationRelay} from "../nostr/relay-capabilities";
import WalkIdentifiers from "./walk-identifiers";
import {paymentFetch,signPayment,type LogoPackView} from "./city-payment";
import EventModerationPanel from "./event-moderation";
import {CityIdentityHealthDetails} from "./city-identity-health";
import type {CityIdentityHealth} from "../server/pro-city-identity-health";
import AdminDataStatus,{resolvedAdminDataState,type AdminDataHealth} from "./admin-data-status";
import {cityMatchesType,cityRelayLabel,cityWorkflowActions,cityWorkflowLabel,cityWorkflowNextStep,cityWorkflowRows,type CityTypeFilter,type CityWorkflowAction,type CityWorkflowRow,type CityWorkflowStatus} from "./city-backlog";
import CityActionsMenu from "./city-actions-menu";
import CopyValue from "./copy-value";
import styles from "./city-moderation.module.css";
import {adminCityRequests} from "../domain/admin-city-requests";
import {createCityUpdateEvent} from "../nostr/city-event";
import {editedCity} from "../nostr/organizer-edit";
import {cityAliases} from "../domain/city";
import {importCityImageURL} from "../lib/media-client";

type CityOgAsset={label:string;url:string};

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
 const [deletedIds,setDeletedIds]=useState<Set<string>>(new Set());
 const [identityHealthError,setIdentityHealthError]=useState("");
 const [selectedId,setSelectedId]=useState(dashboard.selectedCity);
 const [query,setQuery]=useState("");
 const [cityTypeFilter,setCityTypeFilter]=useState<CityTypeFilter>("all");
 const [calendarWalks,setCalendarWalks]=useState<CalendarWalk[]>([]);
 const [publicUrls,setPublicUrls]=useState<Record<string,string>>({});
 const [publicAliases,setPublicAliases]=useState<Record<string,string>>({});
 const [editingRow,setEditingRow]=useState<ManagedCity|null>(null);
 const [editDescription,setEditDescription]=useState(""),[editAliases,setEditAliases]=useState(""),[editMeeting,setEditMeeting]=useState(""),[editHero,setEditHero]=useState("");
 const [editLatitude,setEditLatitude]=useState(""),[editLongitude,setEditLongitude]=useState("");
 const [editAssets,setEditAssets]=useState<CityOgAsset[]>([]),[editAssetsMessage,setEditAssetsMessage]=useState("");
 const [dataHealth,setDataHealth]=useState<AdminDataHealth>({state:"loading",message:"Loading the city directory and operational checks…"});
 const [directoryCurrent,setDirectoryCurrent]=useState(false);
 const serviceCheckGeneration=useRef(0),lock=useRef(false);const [busy,setBusy]=useState(false),[rows,setRows]=useState<ManagedCity[]>([]),[events,setEvents]=useState<Event[]>([]),[message,setMessage]=useState("Loading cities…");
 async function admin(){if(!isSuperAdmin(await getBrowserExtensionPubkey()))throw new Error("Select the BitcoinWalk super-admin in your extension.");}
 async function records(){const directory=await queryDirectoryRecords(relayConfig.writeRelays),applications=adminCityRequests(directory.revisions,directory.approvals);return {rows:managedCities(directory.revisions,directory.approvals),calendarWalks:approvedCalendarWalks(directory.revisions,directory.approvals),needsChanges:applications.filter(row=>row.status==="needs-changes"&&row.decision).map(row=>({revision:row.revision,rejection:row.decision!})),pending:applications.filter(row=>row.status==="pending").map(row=>row.revision),rejected:applications.filter(row=>row.status==="rejected").map(row=>row.revision),deleted:deletedCityIds(directory.approvals)};}
 async function reload(cityId=selectedId){
 const hadData=rows.length>0;
  const retainedOperationalData=paymentInventoryReady||logoPacks.length>0||identityHealth.length>0;
  const generation=++serviceCheckGeneration.current;
  setDirectoryCurrent(false);
  setDashboardAuthorizationScope(authorizationScope,false);
  setDataHealth(current=>({state:"loading",message:"Refreshing cities without clearing the current view or unsaved URL edits…",checkedAt:current.checkedAt}));
  try{
   const snapshot=await records(),nextEvents=cityId?await queryCalendarEvents(relayConfig.writeRelays,{cityId}):[];
   if(nextEvents.length>=500)throw new Error("This city's event read limit was reached. Ask an administrator to review its history.");
   await admin();const pubkey=await getBrowserExtensionPubkey();
   setRows(snapshot.rows);setCalendarWalks(snapshot.calendarWalks);setNeedsChanges(snapshot.needsChanges);setPending(snapshot.pending);setRejected(snapshot.rejected);setDeletedIds(snapshot.deleted);setEvents(nextEvents);
   setPaymentInventoryReady(false);
   setDirectoryCurrent(true);setDashboardAuthorizationScope(authorizationScope,true);
   const checkedAt=new Date().toISOString(),state=resolvedAdminDataState({incomplete:false,retainedData:false,hasFreshData:true,visibleCount:snapshot.rows.length});
   setDataHealth({state,message:snapshot.rows.length?`${snapshot.rows.length} cities were checked successfully. Identity and payment evidence is refreshing separately.`:"No cities were returned by the verified directory. Identity and payment evidence is refreshing separately.",checkedAt});
   void signPayment({action:"list"},pubkey).then(paymentFetch).then(logoResult=>{
    if(serviceCheckGeneration.current!==generation)return;
    setLogoPacks(logoResult.logoPacks??[]);setPaidCityIds(new Set((logoResult.payments??[]).filter(payment=>payment.tier==="paid").map(payment=>payment.cityId)));setIdentityHealth(logoResult.identityHealth??[]);setIdentityHealthError(logoResult.identityHealthError??"");setPaymentInventoryReady(true);
    setDataHealth({state,message:snapshot.rows.length?`${snapshot.rows.length} cities and their identity and payment evidence were checked successfully.`:"No cities were returned by the verified directory.",checkedAt:new Date().toISOString()});
   }).catch(()=>{
    if(serviceCheckGeneration.current!==generation)return;
    setPaymentInventoryReady(false);setIdentityHealthError("City identity and payment checks could not be refreshed. Their last-known results remain visible. City status and deletion actions use the current directory and remain available; payment-dependent request cleanup is paused.");
    const fallback=resolvedAdminDataState({incomplete:true,retainedData:retainedOperationalData,hasFreshData:true,visibleCount:snapshot.rows.length});
    setDataHealth({state:fallback,message:retainedOperationalData?"The city directory is current. Identity and payment checks are showing last-known results, but city status and deletion actions remain available.":"The city directory is current. Identity and payment checks are unavailable, but city status and deletion actions remain available.",checkedAt:new Date().toISOString()});
   });
  }catch(error){setDirectoryCurrent(false);setDashboardAuthorizationScope(authorizationScope,false);const checkedAt=new Date().toISOString(),detail=error instanceof Error?error.message:"City data could not be loaded.",state=resolvedAdminDataState({incomplete:true,retainedData:hadData,hasFreshData:false,visibleCount:rows.length});setDataHealth({state,message:hadData?`${detail} Last-known cities and unsaved URL edits remain visible; changes are paused.`:detail,checkedAt});throw error;}
 }
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await admin();await action();}catch(e){setMessage(e instanceof Error?e.message:"Operation failed. Reload before retrying.");}finally{lock.current=false;setBusy(false);}}
 async function current(row:ManagedCity){const found=(await records()).rows.find(r=>r.revision.city.cityId===row.revision.city.cityId);if(!found||found.head!==row.head)throw new Error("City decisions changed. Reload before continuing.");return found;}
 async function decide(row:ManagedCity,action:"approve"|"disapprove"){
  setMessage("Checking signer and current city decision…");
  await run(async()=>{const city=row.revision.city;const latest=await current(row);
   const warning=action==="approve"?`Restore ${city.cityName} online, revision ${row.revision.event.id}? This restores its public events but does not publish a new occurrence.`:`Set ${city.cityName} offline? This hides the city and all its events from BitcoinWalk public views. Ownership, signed history and provisioned services remain.`;
   if(!window.confirm(warning)){setMessage("Cancelled. No change published.");return;}
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
 async function deleteOfflineCity(row:ManagedCity){
  const city=row.revision.city;
  const confirmation=`DELETE ${city.slug}`;
  const warning=`${DELETE_CITY_NOTE}\n\nCity: ${city.cityName} (${city.cityId})\n\nThis removes the city from BitcoinWalk Cities, Requests, host editing, public pages and walk discovery. It does not erase signed events already copied to third-party Nostr relays. Payment records and any provisioned relay, NIP-05, Lightning, chat or other services remain; service shutdown is a separate verified operation.\n\nType '${confirmation}' to continue:`;
  if(window.prompt(warning)!==confirmation){setMessage("Cancelled. Nothing deleted.");return;}
  await run(async()=>{
   setMessage("Checking the current offline state…");
   const latest=await current(row);
   if(latest.state==="approved")throw new Error("Set this city offline before deleting it.");
   const template=createCityDeletionDecision(latest);
   setMessage("Approve permanent deletion in your signer…");const signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);await admin();await current(row);
   setMessage("Publishing the signed deletion…");
   await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
   setMessage("Deletion published. Verifying exact relay read-back…");
   const readback=await queryDirectoryRecords(relayConfig.writeRelays);if(!deletedCityIds(readback.approvals).has(city.cityId))throw new Error("Deletion was acknowledged but exact relay read-back failed. Reload before retrying.");
   setSelectedId("");await reload("");setMessage(`${city.cityName} was permanently removed from BitcoinWalk inventory. Signed history, payment records and provisioned services remain.`);
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
 function closeCityEditor(){if(busy)return;setEditingRow(null);setEditAssets([]);setEditAssetsMessage("");}
 function openCityEditor(row:ManagedCity){
  const city=row.revision.city;
  setEditingRow(row);setEditDescription(city.description);setEditAliases((city.aliases??[]).join("\n"));setEditMeeting(city.meetingPoint.description);setEditHero(city.heroImageUrl??"");setEditLatitude(String(city.meetingPoint.latitude));setEditLongitude(String(city.meetingPoint.longitude));setEditAssets([]);setEditAssetsMessage("Loading the current city and walk OG assets…");
  void Promise.allSettled([fetch("/api/cities",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<{cities?:Array<{id:string;avatarUrl:string}>}>;}),fetch("/api/events",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<{events?:Array<{name:string;link:string;image:string}>}>;})]).then(results=>{
   const assets:CityOgAsset[]=[];if(results[0].status==="fulfilled"){const cityAsset=results[0].value.cities?.find(item=>item.id===city.cityId);if(cityAsset?.avatarUrl)assets.push({label:"Current city OG image",url:cityAsset.avatarUrl});}
   if(results[1].status==="fulfilled")for(const event of results[1].value.events??[]){try{if(new URL(event.link).pathname.split("/").filter(Boolean)[0]===city.slug&&event.image)assets.push({label:event.name,url:event.image});}catch{}}
   const unique=[...new Map(assets.map(asset=>[asset.url,asset])).values()];setEditAssets(unique);setEditAssetsMessage(unique.length?`${unique.length} current OG asset${unique.length===1?"":"s"} loaded.`:results.every(result=>result.status==="rejected")?"Current OG assets could not be loaded.":"No generated OG assets are currently available for this city.");
  });
 }
 async function submitCityEdit(event:FormEvent<HTMLFormElement>){event.preventDefault();const row=editingRow;if(!row)return;await run(async()=>{
  const latest=await current(row),city=latest.revision.city,latitude=Number(editLatitude),longitude=Number(editLongitude),aliases=cityAliases(editAliases,city.cityName);
  if(!Number.isFinite(latitude)||latitude < -90||latitude > 90)throw new Error("Enter a latitude between -90 and 90.");
  if(!Number.isFinite(longitude)||longitude < -180||longitude > 180)throw new Error("Enter a longitude between -180 and 180.");
  if(aliases.length>20)throw new Error("Use no more than 20 alternative city names.");
  let heroImageUrl=editHero.trim()||undefined;
  if(heroImageUrl&&heroImageUrl!==city.heroImageUrl){setMessage("Approve importing the new city hero into protected BitcoinWalk storage…");heroImageUrl=(await importCityImageURL(city.cityId,heroImageUrl)).url;}
  const candidate=editedCity(city,{startAt:city.startAt,description:editDescription,meetingPoint:{description:editMeeting,latitude,longitude},heroImageUrl,aliases:aliases.length?aliases:undefined});
  setMessage("Approve the city revision in your signer…");const signed=await signWithBrowserExtension(createCityUpdateEvent(candidate,latest.revision.event.id));
  if(!isSuperAdmin(signed.pubkey))throw new Error("Signer identity changed. Select the BitcoinWalk super-admin and retry.");
  await admin();await current(row);await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
  const readback=await queryDirectoryRecords(relayConfig.writeRelays);if(!readback.revisions.some(revision=>revision.event.id===signed.id))throw new Error("The revision was acknowledged but exact relay read-back failed. Reload before retrying.");
  setEditingRow(null);setEditAssets([]);await reload("");setMessage(`${city.cityName} revision submitted. Open Requests to review the new hero and sign the separate approval.`);
 });}
 function eventRow(row:ManagedCity,item:ManagedCalendarEvent){const city=row.revision.city,nevent=calendarNevent(item.event,relayConfig.calendarRelayHints),href=eventPageHref(city.slug,nevent),when=new Intl.DateTimeFormat(undefined,{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000));return <li key={item.event.id}><p><strong>{item.status==="active"?"Active":item.status==="grace"?"Late-arrival grace":item.status==="upcoming"?"Upcoming":"Past"}</strong> — {when}<br/>{item.meetingPoint.description}<br/><WalkIdentifiers organizerNpub={nip19.npubEncode(item.event.pubkey)} nevent={nevent}/></p><p><a href={href} target="_blank" rel="noreferrer">Open event ↗</a>{" "}<button disabled={busy||!directoryCurrent} onClick={()=>removeEvent(row,item)}>Cancel this walk</button></p></li>;}
 const scoped=rows;
 const workflow=cityWorkflowRows({managed:rows,pending,needsChanges,rejected,health:identityHealth,paidCityIds,paidCities:directoryConfig.paidCities,excludedCityIds:deletedIds});
 const normalizedQuery=query.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().trim();
 const visibleWorkflow=workflow.filter(item=>cityMatchesType(item,cityTypeFilter)&&(!normalizedQuery||`${item.cityName} ${item.slug} ${item.cityId}`.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().includes(normalizedQuery)));
 const statusCounts=workflow.reduce<Record<CityWorkflowStatus,number>>((counts,item)=>({...counts,[item.status]:counts[item.status]+1}),{"action-required":0,"awaits-change":0,online:0,offline:0});
 function cityAction(item:CityWorkflowRow,action:CityWorkflowAction){
  const menuItem={role:"menuitem" as const};
  if(action==="open-record")return <button {...menuItem} disabled={busy} onClick={()=>openCityEditor(item.managed!)}>Edit city</button>;
  if(action==="open-public"){const href=item.health&&!item.health.availableInEnvironment?`https://bitcoinwalk.org/${item.slug}`:`/${item.slug}`;return <a {...menuItem} href={href} target="_blank" rel="noreferrer">Open public page <span aria-hidden="true">↗</span></a>;}
  if(action==="review-request"){const id=item.pending?.event.id??item.needsChanges?.revision.event.id;return <Link {...menuItem} href={`/admin/requests#submission-${id}`}>{item.source==="pending"?"Review application":"Review requested changes"}</Link>;}
  if(action==="view-decision")return <Link {...menuItem} href={`/admin/requests#submission-${item.rejected!.event.id}`}>View final decision</Link>;
  if(action==="activate-pro")return <Link {...menuItem} href="/admin/requests#pro-city-activations">Set as active</Link>;
  if(action==="manage-pro")return <Link {...menuItem} href="/admin/requests#post-approval-follow-ups">Review Pro follow-up</Link>;
  if(action==="set-online")return <button {...menuItem} disabled={busy||!directoryCurrent} onClick={()=>decide(item.managed!,"approve")}>Restore online</button>;
  if(action==="set-offline")return <button {...menuItem} disabled={busy||!directoryCurrent} onClick={()=>decide(item.managed!,"disapprove")}>Set offline</button>;
  if(action==="delete")return <button {...menuItem} className={styles.destructiveMenuItem} disabled={busy||!directoryCurrent} onClick={()=>deleteOfflineCity(item.managed!)}>Delete permanently</button>;
  return <button {...menuItem} className={styles.destructiveMenuItem} disabled={busy||!directoryCurrent||!paymentInventoryReady} onClick={()=>archiveAwaitingCity(item.needsChanges!)}>Archive request</button>;
 }
 useEffect(()=>()=>{serviceCheckGeneration.current++;clearDashboardAuthorizationScope(authorizationScope);},[]);
 useEffect(()=>{if(!editingRow)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy){setEditingRow(null);setEditAssets([]);setEditAssetsMessage("");}};document.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",close);};},[editingRow,busy]);
 return <section>
  <div className={styles.sectionHeading}><div><h2>Cities</h2><p>One operational backlog for every city. Work owned by the super-admin appears first, followed by work awaiting a host or provider.</p></div><button disabled={busy} onClick={()=>run(async()=>{await reload();setMessage("City state and selected city's walks refreshed.");})}>Refresh cities</button></div>
  <AdminDataStatus health={dataHealth} busy={busy} onRetry={()=>void run(async()=>{await reload(selectedId);setMessage("City state and selected city's walks refreshed.");})} scope="Cities" hideWhenReady/>
  <div className={styles.summary} aria-label="City status totals"><span className={styles.count}>Action required {statusCounts["action-required"]}</span><span className={styles.count}>Awaits change {statusCounts["awaits-change"]}</span><span className={styles.count}>Online {statusCounts.online}</span><span className={styles.count}>Offline {statusCounts.offline}</span></div>
  <div className={styles.toolbar}><label>Filter cities<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name, slug or city ID"/></label><label>City type<select value={cityTypeFilter} onChange={event=>setCityTypeFilter(event.target.value as CityTypeFilter)}><option value="all">All city types</option><option value="basic">Basic</option><option value="pro-managed">Pro · managed relay</option><option value="pro-own">Pro · own relay</option></select></label></div>
  <ol className={styles.list} aria-label="City operational backlog">{visibleWorkflow.length?visibleWorkflow.map(item=>{const nextStep=cityWorkflowNextStep(item);return <li className={styles.item} key={item.cityId}>
   <div className={styles.row}><div className={styles.identity}><span className={styles.dot} data-online={item.online} role="img" aria-label={item.online?"Online":"Offline"}/><div><strong>{item.cityName}</strong><small>/{item.slug} · <CopyValue label={`${item.cityName} city ID`} value={item.cityId}/></small></div></div>
   <div className={styles.badges}><span className={styles.badge} data-status={item.status}>{cityWorkflowLabel(item.status)}</span><span className={styles.badge}>{item.tier==="paid"?"Paid":item.tier==="test"?"Test":"Basic"}</span><span className={styles.badge}>{cityRelayLabel(item.relay)}</span></div>
   <CityActionsMenu cityName={item.cityName}>{cityWorkflowActions(item).map(action=><span className={styles.actionMenuItem} key={action}>{cityAction(item,action)}</span>)}</CityActionsMenu></div>
   {nextStep&&<aside className={styles.nextStep} aria-label={`Next action for ${item.cityName}`}><span className={styles.nextStepMark} aria-hidden="true">→</span><p><strong>Next: {nextStep.owner}</strong> — {nextStep.action}{nextStep.helpHref&&<> <a href={nextStep.helpHref} target="_blank" rel="noreferrer">View host instructions <span aria-hidden="true">↗</span></a></>}</p></aside>}
  </li>}):<li className={styles.empty}>No cities match these filters.</li>}</ol>
  {!!identityHealthError&&<p role="alert">{identityHealthError}</p>}
  {!!needsChanges.length&&<details className={styles.bulk}><summary><strong>Archive eligible Awaits change test cities ({needsChanges.length})</strong></summary><p>This cleanup retains signed history and never deletes infrastructure. Paid or relay-backed cities are blocked.</p><button disabled={busy||!directoryCurrent||!paymentInventoryReady} onClick={archiveRejectedTests}>Archive eligible requests</button>{!paymentInventoryReady&&<p>Payment inventory must load before this action is enabled.</p>}</details>}
  <p role="status">{message}</p>
  {editingRow&&<div className={styles.editBackdrop} role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeCityEditor();}}>
   <section className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="city-edit-title">
    <header className={styles.editHeader}><div><span className={styles.editEyebrow}>City profile</span><h2 id="city-edit-title">Edit {editingRow.revision.city.cityName}</h2><p>Submit a signed revision, then approve it separately in Requests.</p></div><button autoFocus type="button" disabled={busy} onClick={closeCityEditor} aria-label="Close city editor">×</button></header>
    <form onSubmit={submitCityEdit}>
     <div className={styles.editBody}>
      <section className={styles.editFields} aria-label="City details">
       <label>Description<textarea required maxLength={5000} value={editDescription} onChange={event=>setEditDescription(event.target.value)}/></label>
       <label>Alternative city names<textarea maxLength={2020} value={editAliases} onChange={event=>setEditAliases(event.target.value)} placeholder="One name per line"/></label>
       <label>Default meeting point<input required maxLength={500} value={editMeeting} onChange={event=>setEditMeeting(event.target.value)}/></label>
       <div className={styles.coordinateFields}><label>Latitude<input required type="number" min="-90" max="90" step="any" value={editLatitude} onChange={event=>setEditLatitude(event.target.value)}/></label><label>Longitude<input required type="number" min="-180" max="180" step="any" value={editLongitude} onChange={event=>setEditLongitude(event.target.value)}/></label></div>
       <label>Hero image URL<input type="url" value={editHero} onChange={event=>setEditHero(event.target.value)} placeholder="https://… (.png, .jpg or .webp)"/></label>
       <p className={styles.editHelp}>Use a public HTTPS JPEG, PNG or WebP up to 10 MB. BitcoinWalk imports it as a protected 1536 × 1024 WebP after you sign.</p>
       {editHero&&<figure className={styles.heroPreview}><img src={editHero} alt={`Proposed hero for ${editingRow.revision.city.cityName}`} referrerPolicy="no-referrer"/><figcaption>Proposed hero image</figcaption></figure>}
      </section>
      <aside className={styles.assetPanel}><div className={styles.assetHeading}><h3>Current OG assets</h3><a href={`/${encodeURIComponent(editingRow.decision.approval.slug??editingRow.revision.city.slug)}`} target="_blank" rel="noreferrer">Open public city <span aria-hidden="true">↗</span></a></div><p>{editAssetsMessage}</p>
       <div className={styles.assetGrid}>{editAssets.map(asset=><figure key={asset.url}><img src={asset.url} alt={asset.label} referrerPolicy="no-referrer"/><figcaption><strong>{asset.label}</strong><a href={asset.url} target="_blank" rel="noreferrer">Open full size <span aria-hidden="true">↗</span></a></figcaption></figure>)}</div>
       {!editAssets.length&&editingRow.revision.city.heroImageUrl&&<figure><img src={editingRow.revision.city.heroImageUrl} alt={`Current hero for ${editingRow.revision.city.cityName}`} referrerPolicy="no-referrer"/><figcaption><strong>Current stored hero</strong></figcaption></figure>}
      </aside>
     </div>
     <footer className={styles.editFooter}><button type="button" disabled={busy} onClick={closeCityEditor}>Cancel</button><button className={styles.primaryAction} type="submit" disabled={busy}>{busy?"Working…":"Sign and submit revision"}</button></footer>
    </form>
   </section>
  </div>}
  {scoped.filter(row=>row.revision.city.cityId===selectedId).map(row=>{const city=row.revision.city,canonicalSlug=row.decision.approval.slug??city.slug,currentAliases=row.decision.approval.aliases??city.aliases??[],logo=logoPacks.find(pack=>pack.cityId===city.cityId&&pack.revisionId===row.revision.event.id),walk=calendarWalks.find(w=>w.revision.city.cityId===city.cityId),items=walk?managedCalendarEvents(walk,events):[],currentItems=items.filter(item=>item.status!=="past"),past=items.filter(item=>item.status==="past"),showPast=pastCities.has(city.cityId),online=row.state==="approved";return <article className={styles.record} id={`city-admin-${city.cityId}`} key={city.cityId}>
   <h3>{city.cityName} — {online?"online":"offline"}</h3><AdminCityLink city={{...city,slug:canonicalSlug,aliases:currentAliases}} approved={online}/><p>City ID: <CopyValue label={`${city.cityName} city ID`} value={city.cityId}/><br/>Revision: {row.revision.event.id}</p><CityIdentityHealthDetails row={identityHealth.find(item=>item.cityId===city.cityId)}/>
   <details><summary><strong>Public URL</strong></summary><div><label>Canonical URL <span>bitcoinwalk.org/</span><input aria-label="Canonical city URL" value={publicUrls[city.cityId]??canonicalSlug} onChange={event=>setPublicUrls(value=>({...value,[city.cityId]:event.target.value}))}/></label><label>Legacy URL aliases <input aria-label="Legacy city URL aliases" value={publicAliases[city.cityId]??currentAliases.join(", ")} onChange={event=>setPublicAliases(value=>({...value,[city.cityId]:event.target.value}))} placeholder="Previous spellings, separated by commas"/></label><p>For a Pro city, the matching relay hostname is <code>{`${publicUrls[city.cityId]??canonicalSlug}.bitcoinwalk.org`}</code>. Existing aliases redirect to the canonical city URL.</p><button disabled={busy||!directoryCurrent||!online} onClick={()=>savePublicUrl(row)}>Sign and save public URL</button></div></details>
   <p>Logo pack: {logo?`${logo.state} · ${logo.attempts} attempt${logo.attempts===1?"":"s"} · ${logo.publiclyListed?"Pro link visible":"direct link unlisted"}`:"No durable job"}{logo?.href&&<> · <a href={logo.href} target="_blank" rel="noreferrer">Open pack</a></>}</p>
   <section className={styles.lifecycle} aria-label={`${city.cityName} lifecycle`}><div><h4>City status</h4><p>{online?"This city is visible on BitcoinWalk. Set it offline before permanent deletion.":"This city is hidden from BitcoinWalk and can be restored or permanently removed from the inventory."}</p></div><div className={styles.lifecycleActions}>{online?<button disabled={busy||!directoryCurrent} onClick={()=>decide(row,"disapprove")}>Set offline</button>:<><button disabled={busy||!directoryCurrent} onClick={()=>decide(row,"approve")}>Restore online</button><button className={styles.dangerAction} disabled={busy||!directoryCurrent} onClick={()=>deleteOfflineCity(row)}>Delete permanently</button></>}</div></section>
   {!online&&<p className={styles.help}>Permanent deletion removes BitcoinWalk inventory only. Signed history, payment records and provisioned services remain.</p>}
   <p role="status" style={{fontWeight:600}}>{message}</p><EventModerationPanel scope="city" fixedCityId={city.cityId} cityName={city.cityName}/><h4>Published occurrences ({items.length})</h4>{!items.length?<p>{!online?"This city's events are hidden while it is offline. Restore it online to make existing approved events visible again; no new occurrence is created.":"No public events."}</p>:<><ol>{currentItems.map(item=>eventRow(row,item))}</ol>{!!past.length&&<><button disabled={busy} onClick={()=>setPastCities(previous=>{const next=new Set(previous);if(showPast)next.delete(city.cityId);else next.add(city.cityId);return next;})}>{showPast?"Hide":`Show ${past.length}`} past event{past.length===1?"":"s"}</button>{showPast&&<ol>{past.map(item=>eventRow(row,item))}</ol>}</>}</>}
  </article>;})}
 </section>;
}
