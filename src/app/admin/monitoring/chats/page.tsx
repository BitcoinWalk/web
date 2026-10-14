"use client";

import {useCallback,useMemo,useRef,useState} from "react";
import {verifyEvent,type EventTemplate} from "nostr-tools";
import {useDashboard,useDashboardAutoLoad} from "../../../../components/dashboard-context";
import CityFinder from "../../../../components/city-finder";
import {isSuperAdmin} from "../../../../nostr/authority";
import {chatProvisionRequest,type ChatProvisionAction} from "../../../../nostr/chat-provision-request";
import {publishVerifiedEvent} from "../../../../nostr/relay";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../../../../nostr/signer";
import styles from "../monitoring.module.css";

type City={cityId:string;cityName:string;slug:string;tier:"basic"|"pro"};
type Row={cityId:string;tier:"basic"|"pro";slug:string;relay:string;groupId:string;phase:"candidate"|"verified"|"active"|"needs-attention";evidenceDigest:string|null;metadataEventId:string|null;verifiedAt:number|null;activatedAt:number|null;updatedAt:number};
type Report={cities:City[];rows:Row[];inspection?:{name:string};city?:City;row?:Row;error?:string};

function relayFor(city:City){return city.tier==="pro"?`wss://${city.slug}.bitcoinwalk.org/`:"wss://chat.bitcoinwalk.org/";}
function createGroupTemplate(groupId:string):EventTemplate{return {kind:9007,created_at:Math.floor(Date.now()/1000),tags:[["h",groupId],["client","bitcoinwalk.org"]],content:"Create the public, open-join BitcoinWalk city community."};}
function renameGroupTemplate(groupId:string,name:string):EventTemplate{return {kind:9002,created_at:Math.floor(Date.now()/1000),tags:[["h",groupId],["name",name],["open"],["client","bitcoinwalk.org"]],content:"Update the BitcoinWalk city community name."};}

export default function CommunityChatsPage(){
 const dashboard=useDashboard(),lock=useRef(false),[cities,setCities]=useState<City[]>([]),[rows,setRows]=useState<Row[]>([]),[cityId,setCityId]=useState(""),[groupId,setGroupId]=useState(""),[channelName,setChannelName]=useState("chat"),[message,setMessage]=useState("Loading city community status…"),[actionMessage,setActionMessage]=useState(""),[busy,setBusy]=useState(false),[activating,setActivating]=useState(false),selected=useMemo(()=>cities.find(city=>city.cityId===cityId),[cities,cityId]),current=rows.find(row=>row.cityId===cityId),paidCities=useMemo(()=>cities.filter(city=>city.tier==="pro"),[cities]);
 const call=useCallback(async(action:ChatProvisionAction)=>{const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");const event=await signWithBrowserExtension(chatProvisionRequest(action,window.location.origin));if(event.pubkey!==actor)throw new Error("Signer identity changed. Reconnect and retry.");const response=await fetch("/api/monitoring/chats",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,event}),cache:"no-store"}),body=await response.json() as Report;if(!response.ok)throw new Error(body.error??"Community chat verification failed.");return body;},[dashboard.pubkey]);
 const load=async()=>{if(lock.current||!dashboard.pubkey)return;lock.current=true;setBusy(true);try{const body=await call({action:"list"});setCities(body.cities);setRows(body.rows);setCityId(value=>body.cities.some(city=>city.cityId===value)?value:"");setMessage(body.cities.length?`${body.cities.length} approved ${body.cities.length===1?"city":"cities"}; ${body.rows.filter(row=>row.phase==="active").length} active city communities.`:"No approved cities were found.");}catch(error){setMessage(error instanceof Error?error.message:"Community chat status unavailable.");}finally{lock.current=false;setBusy(false);}};useDashboardAutoLoad(load);
 async function create(){if(lock.current||!selected||!groupId.trim()||current)return;lock.current=true;setBusy(true);try{const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");const template=createGroupTemplate(groupId.trim()),signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags))throw new Error("Signer returned a different group request. Nothing was published.");const relay=relayFor(selected);setMessage(`Creating the ${selected.cityName} Walkie Talkie group on its ${selected.tier==="pro"?"dedicated city":"shared community"} relay…`);await publishVerifiedEvent(signed,[relay],1,authenticateWithBrowserExtension);const body=await call({action:"verify",cityId:selected.cityId,slug:selected.slug,groupId:groupId.trim()});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);setMessage(`${body.inspection?.name??selected.cityName} created and independently verified. Review the exact relay and group, then activate separately.`);}catch(error){setMessage(error instanceof Error?error.message:"Community group could not be created.");}finally{lock.current=false;setBusy(false);}}
 async function verify(){if(lock.current||!selected||!groupId.trim())return;lock.current=true;setBusy(true);try{setMessage("Reading signed NIP-29 group metadata from the exact city community relay…");const body=await call({action:"verify",cityId:selected.cityId,slug:selected.slug,groupId:groupId.trim()});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);setMessage(`${body.inspection?.name??selected.cityName} verified. Review the exact relay and group, then activate separately.`);}catch(error){setMessage(error instanceof Error?error.message:"Community chat verification failed.");}finally{lock.current=false;setBusy(false);}}
 async function activate(){if(lock.current||!current?.evidenceDigest)return;lock.current=true;setBusy(true);setActivating(true);setActionMessage("Approve the activation request in your signer. BitcoinWalk will then recheck the exact group.");try{setMessage("Rechecking the group before activation…");const body=await call({action:"activate",cityId:current.cityId,evidenceDigest:current.evidenceDigest});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);const success=`${body.city?.cityName??current.slug} community activated. Public walk pages now use this exact Walkie Talkie.`;setMessage(success);setActionMessage(success);}catch(error){const failure=error instanceof Error?error.message:"Community activation failed.";setMessage(failure);setActionMessage(failure);}finally{lock.current=false;setBusy(false);setActivating(false);}}
 async function rename(){const name=channelName.trim();if(lock.current||!current?.evidenceDigest||current.phase!=="active"||!name)return;lock.current=true;setBusy(true);setActionMessage("Approve the channel-name update in your signer.");try{const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");const template=renameGroupTemplate(current.groupId,name),signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags))throw new Error("Signer returned a different channel-name request. Nothing was published.");setMessage(`Renaming the ${selected?.cityName??current.slug} channel to #${name}…`);await publishVerifiedEvent(signed,[current.relay],1,authenticateWithBrowserExtension);const body=await call({action:"refresh-metadata",cityId:current.cityId,evidenceDigest:current.evidenceDigest,name});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);const success=`Channel renamed to #${body.inspection?.name??name}. Its routing, membership and history are unchanged.`;setMessage(success);setActionMessage(success);}catch(error){const failure=error instanceof Error?error.message:"Channel name could not be changed.";setMessage(failure);setActionMessage(failure);}finally{lock.current=false;setBusy(false);}}
 function chooseCity(id:string){const row=rows.find(value=>value.cityId===id),city=cities.find(value=>value.cityId===id);setCityId(id);setGroupId(row?.groupId??(city?`bitcoinwalk-${city.slug}`:""));setChannelName("chat");setActionMessage("");}
 const mayVerify=!current||current.phase==="candidate"||current.phase==="needs-attention";
 return <main>
  <p>BitcoinWalk / dashboard / monitoring / communities</p>
  <h1>City communities</h1>
  <p>Create a public, open-join NIP-29 Walkie Talkie group for any approved city. Basic cities use the shared community relay; Pro cities use their combined event and community relay. Creation, verification and activation are separate signed actions.</p>
  <button type="button" disabled={busy} onClick={load}>{busy?"Working…":"Refresh"}</button>
  <p role="status" aria-live="polite">{message}</p>
  <section>
   <h2>Paid communities</h2>
   {!paidCities.length?<p>No paid communities.</p>:paidCities.map(city=>{const row=rows.find(value=>value.cityId===city.cityId);return <article key={city.cityId} className={styles.card} data-rag={row?.phase==="active"?"green":row?.phase==="verified"?"amber":"red"}>
    <h3>{city.cityName}</h3>
    <p><code>{relayFor(city)}</code><br/>{row?<><code>{row.groupId}</code> · {row.phase}</>:"Not provisioned"}</p>
   </article>;})}
  </section>
  {cities.length>0&&<section>
   <h2>Provision a community</h2>
   <CityFinder items={cities.map(city=>({id:city.cityId,name:city.cityName,meta:city.tier==="pro"?"Pro · dedicated relay":"Basic · shared relay",keywords:[city.slug,city.cityId,city.tier]}))} value={cityId} disabled={busy} label="City" placeholder="Search all approved cities…" onChange={id=>chooseCity(id)}/>
   {selected&&<>
    <p>{selected.tier==="pro"?"Combined event and community relay":"Shared community relay"}: <code>{relayFor(selected)}</code></p>
    <label>Group ID<input value={groupId} disabled={busy||!!current} onChange={event=>setGroupId(event.target.value)} placeholder={`bitcoinwalk-${selected.slug}`} autoComplete="off" spellCheck={false}/></label>
    {!current&&<button type="button" disabled={busy||!groupId.trim()} onClick={()=>void create()}>Sign and create group</button>}
    {mayVerify&&<button type="button" disabled={busy||!groupId.trim()} onClick={()=>void verify()}>Sign and verify group</button>}
    {current&&<article className={styles.card} data-rag={current.phase==="active"?"green":current.phase==="verified"?"amber":"red"}>
     <h3>{selected.cityName} — {current.phase==="needs-attention"?"needs attention":current.phase}</h3>
     <p><code>{current.relay}</code><br/><code>{current.groupId}</code></p>
     {current.metadataEventId&&<p>Signed metadata: <code>{current.metadataEventId}</code></p>}
     {current.phase==="verified"&&<><p><strong>Group created and verified.</strong> One final action remains: activate it for public walk pages.</p><button type="button" disabled={busy||activating} onClick={()=>void activate()}>{activating?"Waiting for signature…":"Sign and activate community"}</button>{actionMessage&&<p role="status" aria-live="polite"><strong>{actionMessage}</strong></p>}</>}
     {current.phase==="active"&&<><p role="status"><strong>Setup complete.</strong> This community is active on public walk pages.</p><label>Channel name<input value={channelName} maxLength={80} disabled={busy} onChange={event=>setChannelName(event.target.value)} autoComplete="off" spellCheck={false}/></label><button type="button" disabled={busy||!channelName.trim()} onClick={()=>void rename()}>Sign and rename channel</button>{actionMessage&&<p role="status" aria-live="polite"><strong>{actionMessage}</strong></p>}<p><a href={`https://armada.buzz/s/${new URL(current.relay).hostname}/${encodeURIComponent(current.groupId)}`} target="_blank" rel="noopener noreferrer">Open Armada ↗</a></p></>}
    </article>}
   </>}
  </section>}
  {rows.filter(row=>!cities.some(city=>city.cityId===row.cityId)).map(row=><article key={row.cityId} className={styles.card} data-rag="red"><h2>{row.slug} — needs review</h2><p>The registry record no longer matches a currently approved city. It is excluded from public routing.</p></article>)}
 </main>;
}
