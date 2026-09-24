"use client";
import {useEffect,useRef,useState} from "react";
import {nip19,verifyEvent,type Event,type EventTemplate} from "nostr-tools";
import {canDelegateWalk,delegationControl,queryDelegation,requireDelegationRelay,walkEnd,type Delegation} from "../nostr/delegations";
import {queryCalendarEvents} from "../nostr/city-records";
import {relayConfig} from "../lib/relay-config";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {publishVerifiedEvent} from "../nostr/relay";
import {discoverInbox,inviteRecipient,preparePrivateInvitation,publicInviteURL} from "../nostr/invitations";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import EditorIdentity from "./editor-identity";
import {walkHostInvitationText} from "../domain/delegation-invite";

export default function WalkDelegation({event,actor="",cityName="",disabled=false,readOnly=false}:{event:Event;actor?:string;cityName?:string;disabled?:boolean;readOnly?:boolean}){
 const [open,setOpen]=useState(false),[current,setCurrent]=useState<Delegation>(),[npub,setNpub]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({});
 const lock=useRef(false),delivery=useRef<{id:string;envelopes:Awaited<ReturnType<typeof preparePrivateInvitation>>;recipient:boolean;recipientRelays:string[];sender:boolean}|undefined>(undefined);
 const [loadedAt]=useState(()=>Math.floor(Date.now()/1000));
 const manage=!readOnly&&canDelegateWalk(actor,event)&&walkEnd(event)>loadedAt;
 let nominee="";try{nominee=inviteRecipient(npub);}catch{}
 const keys=[...new Set([nominee,current?.control.nomineePubkey].filter(Boolean))].join(",");
 useEffect(()=>watchPublicProfiles(keys.split(","),(k,p)=>setProfiles(old=>({...old,[k]:p}))),[keys]);
 useEffect(()=>{let alive=true;queryDelegation(relayConfig.readRelays,event).then(value=>{if(alive)setCurrent(value);}).catch(()=>{if(alive)setMessage("Host status could not be loaded. Open delegation to retry.");});return()=>{alive=false;};},[event]);
 async function refresh(){const value=await queryDelegation(relayConfig.writeRelays,event);setCurrent(value);return value;}
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){setMessage(e instanceof Error?e.message:"Could not confirm delegation.");}finally{lock.current=false;setBusy(false);}}
 async function check(){if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed. Reconnect your organizer account.");await requireDelegationRelay(relayConfig.writeRelays);const live=await queryCalendarEvents(relayConfig.writeRelays,{ids:[event.id]});if(!live.some(e=>e.id===event.id))throw new Error("This walk is no longer available. Refresh the walk list.");}
 async function publish(template:EventTemplate){const signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags)||await getBrowserExtensionPubkey()!==actor)throw new Error("Signer returned a different identity or request. Nothing published.");await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);const value=await refresh();if(value?.event.id!==signed.id)throw new Error("Relay acknowledged the change, but confirmation is incomplete. Refresh before retrying.");return value;}
 function link(invite:Delegation){return `${window.location.origin}/admin/accept-invitation?invite=${invite.event.id}`;}
 async function send(invite:Delegation){
  await check();const latest=await refresh();if(latest?.event.id!==invite.event.id||latest.status!=="pending")throw new Error("Invitation is no longer pending.");publicInviteURL(`${window.location.origin}/start`);
  const [to,self]=await Promise.all([discoverInbox(invite.control.nomineePubkey),discoverInbox(actor)]);
  if(delivery.current?.id!==invite.event.id){const start=Number(event.tags.find(t=>t[0]==="start")?.[1]);const zone=event.tags.find(t=>t[0]==="start_tzid")?.[1]??null;const place=cityName||event.tags.find(t=>t[0]==="title")?.[1]?.replace(/^BitcoinWalk(?: in)?\s+/i,"")||"your city";const text=walkHostInvitationText({cityName:place,start,timeZone:zone,acceptUrl:link(invite)});delivery.current={id:invite.event.id,envelopes:await preparePrivateInvitation(invite.control.nomineePubkey,text,actor),recipient:false,recipientRelays:[],sender:false};}
  const saved=delivery.current;if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed.");
  if(!saved.recipient){const receipt=await publishVerifiedEvent(saved.envelopes.recipient,to,1,authenticateWithBrowserExtension);saved.recipient=true;saved.recipientRelays=receipt.accepted;}
  if(!saved.sender){try{await publishVerifiedEvent(saved.envelopes.sender,self,1,authenticateWithBrowserExtension);saved.sender=true;}catch(e){setMessage(`Nominee inbox acknowledged the encrypted DM on ${saved.recipientRelays.join(", ")} (wrap ${saved.envelopes.recipient.id}). Your own message copy failed: ${e instanceof Error?e.message:"retry it later"}. Ask the nominee to check Armada Direct Messages; relay acceptance does not prove it appeared in the app.`);return;}}
  setMessage(`Nominee inbox acknowledged the encrypted DM on ${saved.recipientRelays.join(", ")} (wrap ${saved.envelopes.recipient.id}). Ask the nominee to check Armada Direct Messages; relay acceptance does not prove it appeared in the app.`);
 }
 async function invite(){await run(async()=>{await check();const previous=await refresh();if(previous?.status==="pending"||previous?.status==="accepted")throw new Error("Revoke the current invitation or host before choosing a replacement.");const saved=await publish(delegationControl(event,actor,inviteRecipient(npub),"invite",previous));setNpub("");setMessage("Invitation saved; sending private message…");try{await send(saved);}catch(e){setMessage(`Invitation saved, awaiting acceptance. DM delivery incomplete: ${e instanceof Error?e.message:"Try again."} Copy the link below or retry delivery.`);}});}
 async function revoke(){await run(async()=>{if(!current||!window.confirm("Revoke hosting for this one walk? Other walks and city permissions will not change."))return;await check();const previous=await refresh();if(previous?.event.id!==current.event.id)throw new Error("Delegation changed. Review the latest status.");await publish(delegationControl(event,actor,current.control.nomineePubkey,"revoke",previous));setMessage("Delegation revoked. The original organizer remains responsible for this walk.");});}
 return <>
  {manage&&<button disabled={busy||disabled} onClick={()=>{setOpen(!open);if(!open)void run(async()=>{await refresh();});}}>Delegate this walk</button>}
  {current?.status==="accepted"&&<div><strong>Hosting this walk</strong><EditorIdentity pubkey={current.control.nomineePubkey} profile={profiles[current.control.nomineePubkey]}/></div>}
  {open&&manage&&<section><h4>Delegate this walk only</h4><p>Your colleague must accept with their own Nostr identity. Their hosting identity will be public on this event. No city permissions or other dates are included. The original organizer and super-admin retain cancellation control.</p><p role="status">{message}</p>
   {current&&<p>Status: <strong>{current.status==="accepted"?"Accepted — colleague is hosting":current.status==="pending"?"Awaiting acceptance":current.status}</strong></p>}
   {current?.status==="pending"&&<><EditorIdentity pubkey={current.control.nomineePubkey} profile={profiles[current.control.nomineePubkey]}/><p><a href={link(current)}>Acceptance link</a>{" "}<button disabled={busy||disabled} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(link(current));setMessage("Acceptance link copied.");})}>Copy link</button>{" "}<button disabled={busy||disabled} onClick={()=>void run(()=>send(current))}>Send / retry DM</button></p><p>Nominee: sign in to Armada with the invited npub and <a href={`https://armada.buzz/dms/${nip19.npubEncode(actor)}`} target="_blank" rel="noopener noreferrer">open the organiser’s Direct Messages ↗</a>. Approve relay authentication and message decryption in your signer if prompted. The invite will not appear in a city chat channel.</p></>}
   {current&&(current.status==="pending"||current.status==="accepted")?<button disabled={busy||disabled} onClick={revoke}>Revoke delegation</button>:<form onSubmit={e=>{e.preventDefault();void invite();}}><label>Colleague’s npub <input required value={npub} onChange={e=>setNpub(e.target.value)} disabled={busy||disabled} placeholder="npub1…"/></label>{nominee&&<EditorIdentity pubkey={nominee} profile={profiles[nominee]}/>}<button disabled={busy||disabled||!nominee}>Invite to host this walk</button></form>}
  </section>}
 </>;
}
