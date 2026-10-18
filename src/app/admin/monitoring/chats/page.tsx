"use client";

import {useCallback,useRef,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {SimplePool,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {useDashboard,useDashboardAutoLoad} from "../../../../components/dashboard-context";
import CityFinder from "../../../../components/city-finder";
import {isSuperAdmin} from "../../../../nostr/authority";
import {chatProvisionRequest,type ChatProvisionAction} from "../../../../nostr/chat-provision-request";
import {publishVerifiedEvent} from "../../../../nostr/relay";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../../../../nostr/signer";
import styles from "../monitoring.module.css";

type City={cityId:string;cityName:string;slug:string;tier:"basic"|"pro";organizerPubkey:string;guidePubkey:string;avatarUrl:string};
type Directory={version:1;cities:Array<{id:string;avatarUrl:string}>};
type Row={cityId:string;tier:"basic"|"pro";slug:string;relay:string;groupId:string;phase:"candidate"|"verified"|"active"|"needs-attention";evidenceDigest:string|null;metadataEventId:string|null;verifiedAt:number|null;activatedAt:number|null;updatedAt:number};
type Report={cities:City[];rows:Row[];inspection?:{name:string;picture:string|null};city?:City;row?:Row;error?:string};
type CommunityTone="green"|"amber"|"red"|"neutral";

const WALKIE_TALKIE_RELAY="wss://chat.bitcoinwalk.org/";
const COMMUNITY_POOL=new SimplePool();
function relayFor(city:City){void city;return WALKIE_TALKIE_RELAY;}
function communityStatus(row:Row|undefined):{tone:CommunityTone;label:string;detail:string}{
 if(!row)return {tone:"neutral",label:"Not set up",detail:"No Walkie Talkie channel has been registered yet."};
 if(row.phase==="active")return {tone:"green",label:"Active",detail:"Available on public walk pages."};
 if(row.phase==="verified")return {tone:"amber",label:"Ready to activate",detail:"Verified successfully; final activation remains."};
 if(row.phase==="candidate")return {tone:"neutral",label:"Setup started",detail:"The channel still needs independent verification."};
 return {tone:"red",label:"Needs attention",detail:"The saved channel evidence needs to be reconciled."};
}
function createGroupTemplate(groupId:string):EventTemplate{return {kind:9007,created_at:Math.floor(Date.now()/1000),tags:[["h",groupId],["client","bitcoinwalk.org"]],content:"Create the public, open-join BitcoinWalk city community."};}
function metadataTemplate(city:City,groupId:string):EventTemplate{return {kind:9002,created_at:Math.floor(Date.now()/1000),tags:[["h",groupId],["name",`BitcoinWalk ${city.cityName}`],["about",`The open community for BitcoinWalk ${city.cityName}. Anyone can join; only members can read messages.`],["picture",city.avatarUrl],["open"],["client","bitcoinwalk.org"]],content:"Configure the BitcoinWalk city community."};}
function addMemberTemplate(groupId:string,pubkey:string):EventTemplate{return {kind:9000,created_at:Math.floor(Date.now()/1000),tags:[["h",groupId],["p",pubkey],["client","bitcoinwalk.org"]],content:"Add a founding BitcoinWalk city community member."};}
async function signedPublish(template:EventTemplate,actor:string,relay:string){const signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags))throw new Error("Signer returned a different city-group request. Nothing was published.");await publishVerifiedEvent(signed,[relay],1,authenticateWithBrowserExtension);}
async function groupExists(relay:string,groupId:string){const infoUrl=new URL(relay);infoUrl.protocol="https:";const response=await fetch(infoUrl,{headers:{Accept:"application/nostr+json"},cache:"no-store",signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error("The Walkie Talkie relay identity could not be verified.");const info=await response.json() as {self?:unknown;supported_nips?:unknown};if(typeof info.self!=="string"||!/^[0-9a-f]{64}$/.test(info.self)||!Array.isArray(info.supported_nips)||!info.supported_nips.includes(29))throw new Error("The Walkie Talkie relay identity is invalid.");const events=await COMMUNITY_POOL.querySync([relay],{kinds:[39000],"#d":[groupId],limit:5},{maxWait:9000});return events.some(event=>verifyEvent(event)&&event.pubkey===info.self&&event.tags.some(tag=>tag[0]==="d"&&tag[1]===groupId));}
async function authenticateRelay(target:Awaited<ReturnType<typeof COMMUNITY_POOL.ensureRelay>>){try{await target.auth(authenticateWithBrowserExtension);return;}catch(error){if(!(error instanceof Error)||!error.message.includes("no challenge"))throw error;}await new Promise<void>((resolve,reject)=>{const state:{finished:boolean;timer?:ReturnType<typeof setTimeout>;sub?:ReturnType<typeof target.subscribe>}={finished:false};const finish=(error?:Error)=>{if(state.finished)return;state.finished=true;if(state.timer)clearTimeout(state.timer);state.sub?.close("authentication probe complete");if(error)reject(error);else resolve();};state.sub=target.subscribe([{kinds:[9],"#h":["bitcoinwalk-authentication-probe"],limit:1}],{oneose:()=>finish(new Error("The Walkie Talkie relay did not require authentication for the private probe.")),onclose:reason=>finish(reason.startsWith("auth-required:")?undefined:new Error(`The Walkie Talkie relay authentication probe failed: ${reason}`)),eoseTimeout:5000});state.timer=setTimeout(()=>finish(new Error("The Walkie Talkie relay authentication challenge timed out.")),6000);});await target.auth(authenticateWithBrowserExtension);}
async function roster(relay:string,groupId:string):Promise<Event>{const target=await COMMUNITY_POOL.ensureRelay(relay,{connectionTimeout:8000});await authenticateRelay(target);return await new Promise<Event>((resolve,reject)=>{const events:Event[]=[],state:{finished:boolean;timer?:ReturnType<typeof setTimeout>;sub?:ReturnType<typeof target.subscribe>}={finished:false};const finish=(error?:Error)=>{if(state.finished)return;state.finished=true;if(state.timer)clearTimeout(state.timer);state.sub?.close("membership read complete");const valid=events.filter(event=>verifyEvent(event)&&event.kind===39002&&event.tags.some(tag=>tag[0]==="d"&&tag[1]===groupId)).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id));if(error)reject(error);else if(valid[0])resolve(valid[0]);else reject(new Error("The relay did not return an authenticated membership read-back."));};state.sub=target.subscribe([{kinds:[39002],"#d":[groupId],limit:5}],{onevent:event=>events.push(event),oneose:()=>finish(),onclose:reason=>finish(reason==="membership read complete"?undefined:new Error(`The relay refused the authenticated membership read-back: ${reason}`)),eoseTimeout:9000});state.timer=setTimeout(()=>finish(new Error("The city group membership read-back timed out.")),10000);});}
async function ensureFoundingMembers(city:City,groupId:string,actor:string,relay:string){let membership=await roster(relay,groupId).catch(()=>null),members=new Set(membership?.tags.filter(tag=>tag[0]==="p").map(tag=>tag[1])??[]);for(const pubkey of [...new Set([city.organizerPubkey,city.guidePubkey])])if(pubkey!==actor&&!members.has(pubkey)){await signedPublish(addMemberTemplate(groupId,pubkey),actor,relay);membership=await roster(relay,groupId);members=new Set(membership.tags.filter(tag=>tag[0]==="p").map(tag=>tag[1]));}if(!membership)membership=await roster(relay,groupId);members=new Set(membership.tags.filter(tag=>tag[0]==="p").map(tag=>tag[1]));if(!members.has(actor))throw new Error("The relay-signed roster does not include the group creator and administrator.");return membership;}
async function responseBody<T>(response:Response,label:string):Promise<T>{
 const text=await response.text();
 if(!text.trim())throw new Error(`${label} returned no response (HTTP ${response.status}). Refresh and retry; do not recreate any channel.`);
 try{return JSON.parse(text) as T;}catch{throw new Error(`${label} returned an unreadable response (HTTP ${response.status}). Refresh and retry; do not recreate any channel.`);}
}

export default function CommunityChatsPage(){
 const dashboard=useDashboard(),lock=useRef(false),[cities,setCities]=useState<City[]>([]),[rows,setRows]=useState<Row[]>([]),[cityId,setCityId]=useState(""),[groupId,setGroupId]=useState(""),[message,setMessage]=useState("Loading city community status…"),[actionMessage,setActionMessage]=useState(""),[busy,setBusy]=useState(false),[activating,setActivating]=useState(false),[rolloutProgress,setRolloutProgress]=useState(""),selected=cities.find(city=>city.cityId===cityId),current=rows.find(row=>row.cityId===cityId),missingCities=cities.filter(city=>rows.find(row=>row.cityId===city.cityId)?.phase!=="active");
 const call=useCallback(async(action:ChatProvisionAction)=>{const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");const event=await signWithBrowserExtension(chatProvisionRequest(action,window.location.origin));if(event.pubkey!==actor)throw new Error("Signer identity changed. Reconnect and retry.");const request=()=>fetch("/api/monitoring/chats",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,event}),cache:"no-store"});for(let attempt=0;;attempt++){const response=await request();try{const body=await responseBody<Report>(response,"Community status");if(!response.ok)throw new Error(body.error??`Community chat verification failed (HTTP ${response.status}).`);return body;}catch(error){const detail=error instanceof Error?error.message:"";if(action.action==="list"&&attempt===0&&([502,503,504].includes(response.status)||detail.includes("returned no response")||detail.includes("returned an unreadable response")))continue;throw error;}}},[dashboard.pubkey]);
 const load=async()=>{if(lock.current||!dashboard.pubkey)return;lock.current=true;setBusy(true);try{const [body,directoryResponse]=await Promise.all([call({action:"list"}),fetch("/api/cities",{cache:"no-store"})]),directory=await responseBody<Directory|{error?:string}>(directoryResponse,"City directory");if(!directoryResponse.ok||!("cities" in directory)||directory.version!==1)throw new Error("Current city artwork could not be loaded.");const artwork=new Map(directory.cities.map(city=>[city.id,city.avatarUrl])),cities=body.cities.map(city=>({...city,avatarUrl:artwork.get(city.cityId)??""})).filter(city=>city.avatarUrl);if(cities.length!==body.cities.length)throw new Error("One or more approved cities do not have current group artwork.");setCities(cities);setRows(body.rows);setCityId(value=>cities.some(city=>city.cityId===value)?value:"");setMessage(cities.length?`${cities.length} approved ${cities.length===1?"city":"cities"}; ${body.rows.filter(row=>row.phase==="active").length} active city communities.`:"No approved cities were found.");}catch(error){setMessage(error instanceof Error?error.message:"Community chat status unavailable.");}finally{lock.current=false;setBusy(false);}};useDashboardAutoLoad(load);
 async function configure(){if(lock.current||!selected||!groupId.trim())return;lock.current=true;setBusy(true);try{const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");const relay=relayFor(selected),id=groupId.trim();setMessage(`Preparing BitcoinWalk ${selected.cityName} with its agreed avatar and founding members…`);if(!current&&!await groupExists(relay,id))await signedPublish(createGroupTemplate(id),actor,relay);await signedPublish(metadataTemplate(selected,id),actor,relay);const membership=await ensureFoundingMembers(selected,id,actor,relay),body=current?.phase==="active"?await call({action:"reconcile",cityId:selected.cityId,evidenceDigest:current.evidenceDigest!,picture:selected.avatarUrl,rosterEvent:membership}):await call({action:"verify",cityId:selected.cityId,slug:selected.slug,groupId:id,picture:selected.avatarUrl,rosterEvent:membership});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);setMessage(current?.phase==="active"?`${body.inspection?.name??selected.cityName} now has the agreed avatar and all three founding members.`:`${body.inspection?.name??selected.cityName} is configured and independently verified. Review the exact relay and group, then activate separately.`);}catch(error){setMessage(error instanceof Error?error.message:"Community founding setup could not be completed.");}finally{lock.current=false;setBusy(false);}}
 async function verify(){if(lock.current||!selected||!groupId.trim())return;lock.current=true;setBusy(true);try{setMessage("Reading signed group metadata and the authenticated member list from the exact relay…");const membership=await roster(relayFor(selected),groupId.trim()),body=await call({action:"verify",cityId:selected.cityId,slug:selected.slug,groupId:groupId.trim(),picture:selected.avatarUrl,rosterEvent:membership});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);setMessage(`${body.inspection?.name??selected.cityName} verified with its avatar and three founding members.`);}catch(error){setMessage(error instanceof Error?error.message:"Community chat verification failed.");}finally{lock.current=false;setBusy(false);}}
 async function activate(){if(lock.current||!current?.evidenceDigest)return;lock.current=true;setBusy(true);setActivating(true);setActionMessage("Approve the activation request in your signer. BitcoinWalk will then recheck the exact group.");try{setMessage("Rechecking the group before activation…");const body=await call({action:"activate",cityId:current.cityId,evidenceDigest:current.evidenceDigest});setRows(value=>[...value.filter(row=>row.cityId!==body.row!.cityId),body.row!]);const success=`${body.city?.cityName??current.slug} community activated. Public walk pages now use this exact Walkie Talkie.`;setMessage(success);setActionMessage(success);}catch(error){const failure=error instanceof Error?error.message:"Community activation failed.";setMessage(failure);setActionMessage(failure);}finally{lock.current=false;setBusy(false);setActivating(false);}}
 async function provisionCity(city:City,row:Row|undefined,actor:string){
  const relay=relayFor(city),id=`bitcoinwalk-${city.slug}`;
  if(!row&&!await groupExists(relay,id))await signedPublish(createGroupTemplate(id),actor,relay);
  await signedPublish(metadataTemplate(city,id),actor,relay);
  const membership=await ensureFoundingMembers(city,id,actor,relay);
  const verified=await call({action:"verify",cityId:city.cityId,slug:city.slug,groupId:id,picture:city.avatarUrl,rosterEvent:membership}),candidate=verified.row;
  if(!candidate?.evidenceDigest)throw new Error(`${city.cityName} did not return verified activation evidence.`);
  const activated=await call({action:"activate",cityId:city.cityId,evidenceDigest:candidate.evidenceDigest});
  if(!activated.row||activated.row.phase!=="active")throw new Error(`${city.cityName} did not become active.`);
  return activated.row;
 }
 async function provisionAll(){
  if(lock.current||!missingCities.length)return;lock.current=true;setBusy(true);setRolloutProgress("");
  let completed=0,currentName="";
  try{
   const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");
   const known=new Map(rows.map(row=>[row.cityId,row]));
   for(const city of missingCities){currentName=city.cityName;setRolloutProgress(`Provisioning ${completed+1} of ${missingCities.length}: ${city.cityName}. Approve the requested signatures in your signer.`);const active=await provisionCity(city,known.get(city.cityId),actor);known.set(city.cityId,active);setRows([...known.values()]);completed++;}
   const success=`All ${completed} remaining city channels are active. Every approved city now has its own Walkie Talkie.`;setMessage(success);setRolloutProgress(success);
  }catch(error){const detail=error instanceof Error?error.message:"The all-city rollout stopped.";const failure=`Rollout paused after ${completed} ${completed===1?"city":"cities"}${currentName?` while provisioning ${currentName}`:""}. ${detail} Completed channels remain active; retry to resume with the remaining cities.`;setMessage(failure);setRolloutProgress(failure);}finally{lock.current=false;setBusy(false);}
 }
 function chooseCity(id:string){const row=rows.find(value=>value.cityId===id),city=cities.find(value=>value.cityId===id);setCityId(id);setGroupId(row?.groupId??(city?`bitcoinwalk-${city.slug}`:""));setActionMessage("");}
 const mayVerify=!current||current.phase==="candidate"||current.phase==="needs-attention";
 return <main>
  <p>BitcoinWalk / dashboard / monitoring / communities</p>
  <h1>City communities</h1>
  <p>Create a city-scoped NIP-29 Walkie Talkie channel for every approved city. Each channel is named BitcoinWalk + city, uses the approved city artwork, and starts with the super-admin, current city host and BitcoinWalk Guide. Every Walkie Talkie channel uses the shared chat relay. Pro-city Armada and Concord routing remains on the city relay.</p>
  <button type="button" disabled={busy} onClick={load}>{busy?"Working…":"Refresh"}</button>
  <p role="status" aria-live="polite">{message}</p>
  <section><h2>Organizer chat</h2><p>The private cross-city organizer room is managed with host access, not relay monitoring.</p><p><Link href="/admin/organizers?tab=chat">Open Hosts → Organizer chat →</Link></p></section>
  <section>
   <h2>All approved city channels</h2>
   <p>{cities.length} approved {cities.length===1?"city":"cities"}; {cities.length-missingCities.length} active and {missingCities.length} remaining. The rollout creates one isolated <code>bitcoinwalk-&lt;city&gt;</code> group per approved city on the shared relay. Existing active channels and London&apos;s separate Pro relay are not replaced.</p>
   <button type="button" disabled={busy||!missingCities.length} onClick={()=>void provisionAll()}>{missingCities.length?`Sign and provision ${missingCities.length} remaining ${missingCities.length===1?"channel":"channels"}`:"All city channels are active"}</button>
   <p>Each city is independently created, verified and activated before the next begins. If signing or relay verification stops, completed cities remain valid and this action resumes with only the remaining cities.</p>
   {rolloutProgress&&<p role="status" aria-live="polite"><strong>{rolloutProgress}</strong></p>}
  </section>
  <section>
   <div className={styles.sectionHeading}>
    <div><h2>All city communities</h2><p>Every approved Basic and Pro city gets its own NIP-29 Walkie Talkie group. Neutral cards are waiting for setup; red is reserved for a channel that needs intervention.</p></div>
    <div className={styles.summary} aria-label="City community status summary">
     <span data-rag="green">{cities.filter(city=>rows.find(row=>row.cityId===city.cityId)?.phase==="active").length} active</span>
     <span data-rag="amber">{cities.filter(city=>rows.find(row=>row.cityId===city.cityId)?.phase==="verified").length} ready to activate</span>
     <span>{cities.filter(city=>!rows.some(row=>row.cityId===city.cityId)).length} not set up</span>
     {rows.some(row=>row.phase==="needs-attention"&&cities.some(city=>city.cityId===row.cityId))&&<span data-rag="red">{rows.filter(row=>row.phase==="needs-attention"&&cities.some(city=>city.cityId===row.cityId)).length} need attention</span>}
    </div>
   </div>
   {!cities.length?<p>No approved city communities.</p>:<div className={styles.communityGrid}>{cities.map(city=>{const row=rows.find(value=>value.cityId===city.cityId),status=communityStatus(row);return <article key={city.cityId} className={`${styles.card} ${styles.communityCard}`} data-rag={status.tone}>
    <header>
     <div className={styles.communityIdentity}><Image unoptimized src={city.avatarUrl} alt="" width={48} height={48}/><div><h3>{city.cityName}</h3><p>{city.tier==="pro"?"Pro":"Basic"} city</p></div></div>
     <span className={styles.rag} data-rag={status.tone}><span className={styles.dot} aria-hidden="true"/>{status.label}</span>
    </header>
    <p>{status.detail}</p>
    <dl><div><dt>Relay</dt><dd><code>{relayFor(city)}</code></dd></div>{row&&<div><dt>Channel</dt><dd><code>{row.groupId}</code></dd></div>}</dl>
   </article>;})}</div>}
  </section>
  {cities.length>0&&<section>
   <h2>Provision a community</h2>
   <CityFinder items={cities.map(city=>({id:city.cityId,name:city.cityName,meta:`${city.tier==="pro"?"Pro":"Basic"} · shared Walkie Talkie`,keywords:[city.slug,city.cityId,city.tier]}))} value={cityId} disabled={busy} label="City" placeholder="Search all approved cities…" onChange={id=>chooseCity(id)}/>
   {selected&&<>
    <p>Walkie Talkie relay: <code>{relayFor(selected)}</code></p>
    <label>Channel ID<input value={groupId} readOnly aria-readonly="true" placeholder={`bitcoinwalk-${selected.slug}`} autoComplete="off" spellCheck={false}/></label>
    <p><Image unoptimized src={selected.avatarUrl} alt={`Group avatar for BitcoinWalk ${selected.cityName}`} width={96} height={96} style={{borderRadius:"50%",objectFit:"cover"}}/><br/><strong>BitcoinWalk {selected.cityName}</strong><br/>Founding members: super-admin, current city host and BitcoinWalk Guide.</p>
    {(!current||current.phase==="active"||current.phase==="needs-attention")&&<button type="button" disabled={busy||!groupId.trim()} onClick={()=>void configure()}>{current?.phase==="active"?"Sign and reconcile founding setup":"Sign and create complete group"}</button>}
    {mayVerify&&<button type="button" disabled={busy||!groupId.trim()} onClick={()=>void verify()}>Sign and verify group</button>}
    {current&&<article className={styles.card} data-rag={current.phase==="active"?"green":current.phase==="verified"?"amber":"red"}>
     <h3>{selected.cityName} — {current.phase==="needs-attention"?"needs attention":current.phase}</h3>
     <p><code>{current.relay}</code><br/><code>{current.groupId}</code></p>
     {current.metadataEventId&&<p>Signed metadata: <code>{current.metadataEventId}</code></p>}
     {current.phase==="verified"&&<><p><strong>Group created and verified.</strong> One final action remains: activate it for public walk pages.</p><button type="button" disabled={busy||activating} onClick={()=>void activate()}>{activating?"Waiting for signature…":"Sign and activate community"}</button>{actionMessage&&<p role="status" aria-live="polite"><strong>{actionMessage}</strong></p>}</>}
     {current.phase==="active"&&<><p role="status"><strong>Setup complete.</strong> This Walkie Talkie channel is active on public walk pages. Pro-city Armada and Concord remain on their separate city relay. Reconcile again whenever the signed city host changes.</p>{actionMessage&&<p role="status" aria-live="polite"><strong>{actionMessage}</strong></p>}<p><a href={`https://chat.bitcoinwalk.org/${encodeURIComponent(current.slug)}`} target="_blank" rel="noopener noreferrer">Open Walkie Talkie channel ↗</a></p></>}
    </article>}
   </>}
  </section>}
  {rows.filter(row=>!cities.some(city=>city.cityId===row.cityId)).map(row=><article key={row.cityId} className={styles.card} data-rag="red"><h2>{row.slug} — needs review</h2><p>The registry record no longer matches a currently approved city. It is excluded from public routing.</p></article>)}
 </main>;
}
