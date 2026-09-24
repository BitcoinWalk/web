"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {verifyEvent,type Event} from "nostr-tools";
import {DELEGATION_KIND,delegationAcceptance,queryDelegation,requireDelegationRelay,type Delegation} from "../../../nostr/delegations";
import {queryCalendarEvents,queryRelayEvents} from "../../../nostr/city-records";
import {relayConfig} from "../../../lib/relay-config";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../../../nostr/signer";
import {publishVerifiedEvent} from "../../../nostr/relay";
import {watchPublicProfiles,type PublicProfile} from "../../../nostr/profiles";
import EditorIdentity from "../../../components/editor-identity";
import {calendarNevent,calendarOccurrence,loadCalendarWalks} from "../../../nostr/calendar-records";
import {eventPageHref} from "../../../domain/event-routing";
import {directoryConfig} from "../../../lib/directory-config";
export default function WalkInvitation(){
 const [href,setHref]=useState("");
 const [invite,setInvite]=useState<Delegation>(),[walk,setWalk]=useState<Event>(),[actor,setActor]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("Connect the invited identity to review this one walk."),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({});
 const lock=useRef(false),keys=[invite?.event.pubkey,invite?.control.nomineePubkey].filter(Boolean).join(",");
 useEffect(()=>watchPublicProfiles(keys.split(","),(k,p)=>setProfiles(old=>({...old,[k]:p}))),[keys]);
 async function read(id:string){
  if(!/^[0-9a-f]{64}$/.test(id))throw new Error("Incomplete invitation link.");
  const found=await queryRelayEvents(relayConfig.writeRelays,[DELEGATION_KIND],undefined,{ids:[id],limit:1});
  const e=found.find(e=>e.id===id&&verifyEvent(e));if(!e)throw new Error("Invitation not found.");
  const c=JSON.parse(e.content);if(c.version!==2)throw new Error("This old city-wide invitation has been retired. Ask the organizer to delegate an individual walk.");
  const events=await queryCalendarEvents(relayConfig.writeRelays,{ids:[c.eventId]});const event=events.find(e=>e.id===c.eventId);if(!event)throw new Error("This walk is no longer available. It may have been cancelled or disapproved.");
  const current=await queryDelegation(relayConfig.writeRelays,event);if(!current||current.event.id!==id)throw new Error("This invitation was revoked or replaced.");
  const cities=await loadCalendarWalks(relayConfig.readRelays);const city=cities.find(w=>w.revision.city.cityId===c.cityId)?.revision.city;
  return {current,event,href:city?eventPageHref(city.cityId,city.slug,calendarNevent(event,relayConfig.readRelays),directoryConfig.paidCities):""};
 }
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await fn();}catch(e){setMessage(e instanceof Error?e.message:"Could not confirm the invitation.");}finally{lock.current=false;setBusy(false);}}
 async function load(){await run(async()=>{setInvite(undefined);setWalk(undefined);const identity=await getBrowserExtensionPubkey();const result=await read(new URLSearchParams(window.location.search).get("invite")??"");if(await getBrowserExtensionPubkey()!==identity)throw new Error("Signer changed. Connect again.");setActor(identity);setInvite(result.current);setWalk(result.event);setHref(result.href);setMessage(identity!==result.current.control.nomineePubkey?"Select the invited identity and connect again.":result.current.status==="accepted"?"You accepted hosting this walk.":result.current.status==="pending"?"Review the date and meeting point, then accept.":"This invitation has expired or been revoked.");});}
 async function accept(){if(!invite)return;await run(async()=>{await requireDelegationRelay(relayConfig.writeRelays);if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed.");const {current}=await read(invite.event.id);const template=delegationAcceptance(current,actor);const signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags)||await getBrowserExtensionPubkey()!==actor)throw new Error("Signer returned a different identity or request.");await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);const confirmed=await read(invite.event.id);if(confirmed.current.acceptance?.id!==signed.id)throw new Error("Acceptance acknowledged, but confirmation incomplete. Reconnect before retrying.");setInvite(confirmed.current);setMessage("Accepted — you are hosting this one walk. No city-wide permissions were granted.");});}
 const occurrence=walk&&calendarOccurrence(walk);
 return <main><h1>Walk hosting invitation</h1><p><Link href="/admin/walks">My walks — walks I’m hosting</Link></p><button disabled={busy} onClick={load}>Connect and view invitation</button><p role="status">{message}</p>{invite&&walk&&<section><h2>{walk.tags.find(t=>t[0]==="title")?.[1]??"BitcoinWalk"}</h2>{occurrence&&<><p>{new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",...(occurrence.timeZone?{timeZone:occurrence.timeZone}:{})}).format(new Date(occurrence.start*1000))}{occurrence.timeZone?" ("+occurrence.timeZone+")":""}</p><p>{occurrence.meetingPoint.description}</p></>}<p>Invited by</p><EditorIdentity pubkey={invite.event.pubkey} profile={profiles[invite.event.pubkey]}/><p>Invited host</p><EditorIdentity pubkey={invite.control.nomineePubkey} profile={profiles[invite.control.nomineePubkey]}/><p>You are accepting responsibility to attend and host this date only. Your hosting identity will be public on this event. This does not grant city editing, other dates, cancellation or onward delegation. The original organizer and super-admin remain in control.</p>{invite.status==="pending"&&<><p>Accept by {new Date(invite.control.expiresAt*1000).toLocaleString()}.</p><button disabled={busy||actor!==invite.control.nomineePubkey} onClick={accept}>Accept hosting this walk</button></>}{href&&<Link href={href}>Open this walk</Link>}</section>}</main>;
}
