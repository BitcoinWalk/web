"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {Event} from "nostr-tools";
import {relayConfig} from "../lib/relay-config";
import {queryCalendarEvents} from "../nostr/city-records";
import {loadCalendarWalks} from "../nostr/calendar-records";
import {cityAnnouncementCandidate,createCityAnnouncement,matchesCityAnnouncement,queryCityAnnouncements,type CityAnnouncementCandidate} from "../nostr/city-announcement";
import {publishVerifiedEvent} from "../nostr/relay";
import {assertExactSigned} from "../nostr/moderation";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import styles from "./requests-screen.module.css";

const STORAGE="bitcoinwalk:city-announcement:v1:";
type Row={candidate?:CityAnnouncementCandidate;cityId:string;cityName:string;reason?:string;published?:Event};

function saved(candidate:CityAnnouncementCandidate):Event|null{
 try{const value=localStorage.getItem(STORAGE+candidate.walk.revision.city.cityId);if(!value)return null;const event=JSON.parse(value) as Event;return matchesCityAnnouncement(event,candidate)?event:null;}catch{return null;}
}

async function existingAnnouncements(relays:string[],cityIds:string[]){
 const settled=await Promise.allSettled(relays.map(relay=>queryCityAnnouncements([relay],cityIds))),events:Event[]=[],byRelay=new Map<string,Event[]>();
 settled.forEach((result,index)=>{if(result.status==="fulfilled"){events.push(...result.value);byRelay.set(relays[index],result.value);}});
 return {events:[...new Map(events.map(event=>[event.id,event])).values()],byRelay,failed:settled.filter(result=>result.status==="rejected").length};
}

export default function CityAnnouncementReview(){
 const lock=useRef(false),[rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(""),[message,setMessage]=useState("Reviewable announcements are loaded from approved first walks."),relays=relayConfig.announcementRelays,notBefore=relayConfig.announcementNotBefore,enabled=relays.length>0&&notBefore>0;
 const load=useCallback(async()=>{if(lock.current)return;lock.current=true;setBusy("load");try{
  const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");
  const walks=await loadCalendarWalks(relayConfig.readRelays),initialIds=[...new Set(walks.flatMap(walk=>{const approval=walk.initialRelease?.approval.approval??walk.approval.approval;return approval.initialEventIds??(approval.initialEventId?[approval.initialEventId]:[]);} ))],events=await queryCalendarEvents(relayConfig.readRelays,{ids:initialIds}),published=relays.length?await existingAnnouncements(relays,walks.map(walk=>walk.revision.city.cityId)):{events:[] as Event[],byRelay:new Map<string,Event[]>(),failed:0};
  const next=walks.flatMap<Row>(walk=>{const release=walk.initialRelease?.approval??walk.approval,approval=release.approval,id=approval.initialEventIds?.[0]??approval.initialEventId,event=id?events.find(item=>item.id===id):undefined,cityId=walk.revision.city.cityId,found=published.events.find(item=>item.tags.some(tag=>tag[0]==="i"&&tag[1]===cityId));if(enabled&&release.event.created_at<notBefore)return [{cityId,cityName:walk.revision.city.cityName,reason:"This city predates the reviewed announcement rollout and will not be announced retroactively."}];if(!event)return [{cityId,cityName:walk.revision.city.cityName,reason:"The approved first walk could not be read back."}];try{const candidate=cityAnnouncementCandidate(walk,event,relayConfig.calendarRelayHints),retained=saved(candidate),complete=found&&relays.every(relay=>published.byRelay.get(relay)?.some(item=>item.id===found.id));if(found&&(!retained||retained.id!==found.id||complete))return [{cityId,cityName:walk.revision.city.cityName,published:found}];return [{cityId,cityName:walk.revision.city.cityName,candidate}];}catch(error){return [{cityId,cityName:walk.revision.city.cityName,reason:error instanceof Error?error.message:"Announcement inputs are incomplete."}];}});
  setRows(next);setMessage(`${next.filter(row=>row.candidate).length} announcement${next.filter(row=>row.candidate).length===1?"":"s"} ready for review.${!enabled?" Publishing is disabled until relays and the rollout cutoff are configured.":published.failed?` ${published.failed}/${relays.length} announcement relays could not be checked.`:""}`);
 }catch(error){setRows([]);setMessage(error instanceof Error?error.message:"Announcements could not be loaded.");}finally{lock.current=false;setBusy("");}},[relays,enabled,notBefore]);
 useEffect(()=>{if(!lock.current)queueMicrotask(()=>void load());},[load]);
 const pending=useMemo(()=>rows.filter(row=>row.candidate),[rows]);

 async function publish(row:Row){const candidate=row.candidate;if(!candidate||busy||!enabled)return;setBusy(row.cityId);try{
  const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");
  let event=saved(candidate);const latest=await existingAnnouncements(relays,[row.cityId]);
  if(latest.events.some(item=>!event||item.id!==event.id)){setMessage(`${row.cityName} already has a different signed launch announcement. Nothing was republished.`);await load();return;}
  if(!event){const template=createCityAnnouncement(candidate);setMessage(`Review and sign the separate ${row.cityName} launch announcement…`);event=await signWithBrowserExtension(template);assertExactSigned(event,template);localStorage.setItem(STORAGE+row.cityId,JSON.stringify(event));}
  const alreadyVerified=relays.filter(relay=>latest.byRelay.get(relay)?.some(item=>item.id===event!.id)),targets=relays.filter(relay=>!alreadyVerified.includes(relay));
  const results=await Promise.all(targets.map(async relay=>{try{await publishVerifiedEvent(event!,[relay],1,authenticateWithBrowserExtension);const checked=await queryCityAnnouncements([relay],[row.cityId]);if(!checked.some(item=>item.id===event!.id))throw new Error("Exact signed event was not read back.");return {relay,ok:true as const};}catch(error){return {relay,ok:false as const,reason:error instanceof Error?error.message:String(error)};}})),accepted=alreadyVerified.length+results.filter(result=>result.ok).length,failed=results.filter(result=>!result.ok);
  if(!accepted)throw new Error(`No announcement relay accepted the signed event. ${failed.map(item=>`${item.relay}: ${item.reason}`).join("; ")}`);
  if(failed.length){setMessage(`${row.cityName} announcement verified on ${accepted}/${relays.length} relays. The exact signed event is retained; retry to finish: ${failed.map(item=>item.relay).join(", ")}.`);return;}
  localStorage.removeItem(STORAGE+row.cityId);setMessage(`${row.cityName} announcement verified on all ${relays.length} relays.`);await load();
 }catch(error){setMessage(error instanceof Error?error.message:"The announcement could not be published.");}finally{setBusy("");}}

 return <section className={`${styles.module} ${styles.announcementModule}`} aria-labelledby="city-announcement-heading"><div className={styles.moduleHeader}><div><h2 id="city-announcement-heading">New-city announcements</h2><p>Review the exact public Nostr post separately from city approval.</p></div><button type="button" className={styles.refresh} disabled={!!busy} onClick={()=>void load()}>{busy==="load"?"Refreshing…":"Refresh"}</button></div><p className={styles.notice} role="status" aria-live="polite">{message}</p>{pending.length?<div className={styles.announcementList}>{pending.map(row=><article key={row.cityId} className={styles.announcementCard}><h3>{row.cityName}</h3><pre>{row.candidate!.content}</pre><p><strong>Country:</strong> {row.candidate!.countryCode} · <strong>First walk:</strong> verified local time</p><button className={styles.primaryAction} type="button" disabled={!!busy||!enabled} onClick={()=>void publish(row)}>{busy===row.cityId?"Publishing…":enabled?"Sign and publish announcement":"Publishing disabled"}</button></article>)}</div>:<div className={styles.empty}><strong>No announcements ready</strong><span>New cities appear here only after their approved first walk and signed country code can be verified.</span></div>}</section>;
}
