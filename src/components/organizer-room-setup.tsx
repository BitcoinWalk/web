"use client";

import Link from "next/link";
import {SimplePool,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {useRef,useState} from "react";
import {useDashboard} from "./dashboard-context";
import {AdminButton,AdminFeedback,AdminStatusBadge} from "./admin-ui";
import {isSuperAdmin} from "../nostr/authority";
import {chatProvisionRequest} from "../nostr/chat-provision-request";
import {ORGANIZER_ROOM_DESTINATION} from "../nostr/nip29-chat";
import {organizerRoomMembers,organizerRoomMetadataTemplate,organizerRoomRosterPlan,verifiedOrganizerRoomMetadata} from "../nostr/organizer-guides";
import {publishVerifiedEvent} from "../nostr/relay";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import styles from "./organizer-room-setup.module.css";

type City={organizerPubkey:string;guidePubkey:string};
type Report={cities?:City[];error?:string};
type Phase="unchecked"|"working"|"ready"|"error";
const pool=new SimplePool();

function createTemplate():EventTemplate{return {kind:9007,created_at:Math.floor(Date.now()/1000),tags:[["h",ORGANIZER_ROOM_DESTINATION.groupId],["client","bitcoinwalk.org"]],content:"Create the private BitcoinWalk organizer room."};}
function addMemberTemplate(pubkey:string):EventTemplate{return {kind:9000,created_at:Math.floor(Date.now()/1000),tags:[["h",ORGANIZER_ROOM_DESTINATION.groupId],["p",pubkey],["client","bitcoinwalk.org"]],content:"Add a current BitcoinWalk organizer-room member."};}
function removeMemberTemplate(pubkey:string):EventTemplate{return {kind:9001,created_at:Math.floor(Date.now()/1000),tags:[["h",ORGANIZER_ROOM_DESTINATION.groupId],["p",pubkey],["client","bitcoinwalk.org"]],content:"Remove a former BitcoinWalk organizer-room member."};}
async function signedPublish(template:EventTemplate,actor:string){const signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags))throw new Error("Signer returned a different organizer-room request. Nothing was published.");await publishVerifiedEvent(signed,[ORGANIZER_ROOM_DESTINATION.relay],1,authenticateWithBrowserExtension);}
async function relayIdentity(){const url=new URL(ORGANIZER_ROOM_DESTINATION.relay);url.protocol="https:";const response=await fetch(url,{headers:{Accept:"application/nostr+json"},cache:"no-store",signal:AbortSignal.timeout(5000)}),info=await response.json() as {self?:unknown;supported_nips?:unknown};if(!response.ok||typeof info.self!=="string"||!/^[0-9a-f]{64}$/.test(info.self)||!Array.isArray(info.supported_nips)||!info.supported_nips.includes(29))throw new Error("The organizer-room relay identity is unavailable.");return info.self;}
async function groupExists(relayPubkey:string){const events=await pool.querySync([ORGANIZER_ROOM_DESTINATION.relay],{kinds:[39000],"#d":[ORGANIZER_ROOM_DESTINATION.groupId],limit:5},{maxWait:9000});return events.some(event=>verifyEvent(event)&&event.pubkey===relayPubkey&&event.tags.some(tag=>tag[0]==="d"&&tag[1]===ORGANIZER_ROOM_DESTINATION.groupId));}
async function authenticateRelay(target:Awaited<ReturnType<typeof pool.ensureRelay>>){try{await target.auth(authenticateWithBrowserExtension);return;}catch(error){if(!(error instanceof Error)||!error.message.includes("no challenge"))throw error;}await new Promise<void>((resolve,reject)=>{const state:{done:boolean;timer?:ReturnType<typeof setTimeout>;sub?:ReturnType<typeof target.subscribe>}={done:false};const finish=(error?:Error)=>{if(state.done)return;state.done=true;if(state.timer)clearTimeout(state.timer);state.sub?.close("authentication probe complete");if(error)reject(error);else resolve();};state.sub=target.subscribe([{kinds:[9],"#h":["bitcoinwalk-authentication-probe"],limit:1}],{oneose:()=>finish(new Error("The relay did not require authentication for the private-room probe.")),onclose:reason=>finish(reason.startsWith("auth-required:")?undefined:new Error(`The relay authentication probe failed: ${reason}`)),eoseTimeout:5000});state.timer=setTimeout(()=>finish(new Error("The relay authentication challenge timed out.")),6000);});await target.auth(authenticateWithBrowserExtension);}
async function roster():Promise<Event>{const target=await pool.ensureRelay(ORGANIZER_ROOM_DESTINATION.relay,{connectionTimeout:8000});await authenticateRelay(target);return await new Promise<Event>((resolve,reject)=>{const events:Event[]=[],state:{done:boolean;timer?:ReturnType<typeof setTimeout>;sub?:ReturnType<typeof target.subscribe>}={done:false};const finish=(error?:Error)=>{if(state.done)return;state.done=true;if(state.timer)clearTimeout(state.timer);state.sub?.close("membership read complete");const valid=events.filter(event=>verifyEvent(event)&&event.kind===39002&&event.tags.some(tag=>tag[0]==="d"&&tag[1]===ORGANIZER_ROOM_DESTINATION.groupId)).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id));if(error)reject(error);else if(valid[0])resolve(valid[0]);else reject(new Error("The relay did not return an authenticated organizer roster."));};state.sub=target.subscribe([{kinds:[39002],"#d":[ORGANIZER_ROOM_DESTINATION.groupId],limit:5}],{onevent:event=>events.push(event),oneose:()=>finish(),onclose:reason=>finish(reason==="membership read complete"?undefined:new Error(`The relay refused the organizer roster: ${reason}`)),eoseTimeout:9000});state.timer=setTimeout(()=>finish(new Error("The organizer roster read timed out.")),10000);});}

export default function OrganizerRoomSetup(){
 const dashboard=useDashboard(),lock=useRef(false),[phase,setPhase]=useState<Phase>("unchecked"),[message,setMessage]=useState("The room has not been checked from this browser yet."),[organizerCount,setOrganizerCount]=useState<number|null>(null);
 async function setup(){if(lock.current)return;lock.current=true;setPhase("working");setMessage("Approve the private roster check in your signer. Additional signatures are requested only for changes that are needed.");try{
  const actor=await getBrowserExtensionPubkey();if(actor!==dashboard.pubkey||!isSuperAdmin(actor))throw new Error("Connect the BitcoinWalk super-admin identity.");
  const request=await signWithBrowserExtension(chatProvisionRequest({action:"list"},window.location.origin));if(request.pubkey!==actor)throw new Error("Signer identity changed. Reconnect and retry.");
  const response=await fetch("/api/monitoring/chats",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:{action:"list"},event:request}),cache:"no-store"}),body=await response.json() as Report;if(!response.ok||!body.cities)throw new Error(body.error??"Current city owners could not be loaded.");
  const relayPubkey=await relayIdentity(),desired=organizerRoomMembers(body.cities,actor),owners=new Set(body.cities.map(city=>city.organizerPubkey));
  if(!await groupExists(relayPubkey))await signedPublish(createTemplate(),actor);
  await signedPublish(organizerRoomMetadataTemplate(),actor);
  let membership=await roster(),members=membership.tags.filter(tag=>tag[0]==="p").map(tag=>tag[1]),plan=organizerRoomRosterPlan(members,desired);
  for(const pubkey of plan.add)if(pubkey!==actor)await signedPublish(addMemberTemplate(pubkey),actor);
  for(const pubkey of plan.remove)if(pubkey!==actor)await signedPublish(removeMemberTemplate(pubkey),actor);
  membership=await roster();members=membership.tags.filter(tag=>tag[0]==="p").map(tag=>tag[1]);plan=organizerRoomRosterPlan(members,desired);if(plan.add.length||plan.remove.length)throw new Error("The relay-signed roster does not match the current city owners.");
  const metadata=await pool.querySync([ORGANIZER_ROOM_DESTINATION.relay],{kinds:[39000],"#d":[ORGANIZER_ROOM_DESTINATION.groupId],limit:5},{maxWait:9000});if(!verifiedOrganizerRoomMetadata(metadata,relayPubkey))throw new Error("The room is not yet private, restricted and closed.");
  setOrganizerCount(owners.size);setPhase("ready");setMessage(`Ready for ${owners.size} current city ${owners.size===1?"organizer":"organizers"}, BitcoinWalk Guide and BitcoinWalk HQ. Former owners were removed.`);
 }catch(error){setPhase("error");setMessage(error instanceof Error?error.message:"The organizer chat could not be set up.");}finally{lock.current=false;}}
 return <section className={styles.panel} aria-labelledby="organizer-room-title">
  <div className={styles.heading}><span className={styles.avatar} aria-hidden="true">BW</span><div><p className={styles.eyebrow}>Private NIP-29 group</p><h2 id="organizer-room-title">BitcoinWalk Organizers</h2><p><code>{ORGANIZER_ROOM_DESTINATION.groupId}</code></p></div><AdminStatusBadge tone={phase==="ready"?"success":phase==="error"?"danger":phase==="working"?"warning":"neutral"}>{phase==="ready"?"Ready":phase==="error"?"Needs attention":phase==="working"?"Checking":"Not checked"}</AdminStatusBadge></div>
  <p>This is the shared room for current verified city owners. Eligible organizers see it automatically in Chat and can open it with their connected npub—there is no public join queue.</p>
  <div className={styles.access}><div><strong>Access follows ownership</strong><span>Current city owners, BitcoinWalk Guide and BitcoinWalk HQ</span></div><div><strong>Former owners are removed</strong><span>Reconciliation reads back the exact signed relay roster</span></div></div>
  <AdminFeedback tone={phase==="ready"?"success":phase==="error"?"error":"info"}>{message}</AdminFeedback>
  <p className={styles.warning}><strong>Not end-to-end encrypted.</strong> Do not share private keys, recovery files or payout credentials in this room.</p>
  <div className={styles.actions}><AdminButton variant="primary" disabled={phase==="working"} onClick={()=>void setup()}>{phase==="working"?"Waiting for signatures…":phase==="ready"?"Sign and reconcile membership":"Sign and set up organizer chat"}</AdminButton>{phase==="ready"&&<Link href="/admin/chat">Open Chat →</Link>}</div>
  {organizerCount!==null&&<p className={styles.summary}>{organizerCount} current organizer {organizerCount===1?"account":"accounts"} verified.</p>}
 </section>;
}
