"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
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
import {useDashboard,useDashboardAutoLoad} from "../../../components/dashboard-context";
import {AdminButton,AdminFeedback,AdminPageHeader,AdminStatusBadge} from "../../../components/admin-ui";
export default function WalkInvitation(){
 const dashboard=useDashboard();
 const [href,setHref]=useState("");
 const [invite,setInvite]=useState<Delegation>(),[walk,setWalk]=useState<Event>(),[actor,setActor]=useState(""),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[message,setMessage]=useState("Opening this invitation for your connected account…"),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({});
 const lock=useRef(false),keys=[invite?.event.pubkey,invite?.control.nomineePubkey].filter(Boolean).join(",");
 useEffect(()=>watchPublicProfiles(keys.split(","),(k,p)=>setProfiles(old=>({...old,[k]:p}))),[keys]);
 async function read(id:string){
  if(!/^[0-9a-f]{64}$/.test(id))throw new Error("Incomplete invitation link.");
  const found=await queryRelayEvents(relayConfig.writeRelays,[DELEGATION_KIND],undefined,{ids:[id],limit:1});
  const e=found.find(e=>e.id===id&&verifyEvent(e));if(!e)throw new Error("Invitation not found.");
  const c=JSON.parse(e.content);if(c.version!==2)throw new Error("This old city-wide invitation has been retired. Ask the city host to delegate an individual walk.");
  const events=await queryCalendarEvents(relayConfig.writeRelays,{ids:[c.eventId]});const event=events.find(e=>e.id===c.eventId);if(!event)throw new Error("This walk is no longer available. It may have been cancelled or disapproved.");
  const current=await queryDelegation(relayConfig.writeRelays,event);if(!current||current.event.id!==id)throw new Error("This invitation was revoked or replaced.");
  const cities=await loadCalendarWalks(relayConfig.readRelays);const city=cities.find(w=>w.revision.city.cityId===c.cityId)?.revision.city;
  return {current,event,href:city?eventPageHref(city.slug,calendarNevent(event,relayConfig.calendarRelayHints)):""};
 }
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setFailed(false);try{await fn();}catch(e){setFailed(true);setMessage(e instanceof Error?e.message:"Could not confirm the invitation.");}finally{lock.current=false;setBusy(false);}}
 const load=useCallback(async()=>{await run(async()=>{setInvite(undefined);setWalk(undefined);const identity=dashboard.pubkey;if(!identity)throw new Error("Connect your account to open this invitation.");if(await getBrowserExtensionPubkey()!==identity)throw new Error("The signer changed. Reconnect from the account menu.");const result=await read(new URLSearchParams(window.location.search).get("invite")??"");if(await getBrowserExtensionPubkey()!==identity)throw new Error("The signer changed. Reconnect from the account menu.");setActor(identity);setInvite(result.current);setWalk(result.event);setHref(result.href);setMessage(identity!==result.current.control.nomineePubkey?"This invitation belongs to a different account.":result.current.status==="accepted"?"Accepted — this walk is now in My walks.":result.current.status==="pending"?"Review the date, meeting point and invited account, then accept.":"This invitation has expired or been revoked.");});},[dashboard.pubkey]);
 useDashboardAutoLoad(load);
 async function accept(){if(!invite)return;await run(async()=>{await requireDelegationRelay(relayConfig.writeRelays);if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed.");const {current}=await read(invite.event.id);const template=delegationAcceptance(current,actor);const signed=await signWithBrowserExtension(template);if(!verifyEvent(signed)||signed.pubkey!==actor||signed.kind!==template.kind||signed.created_at!==template.created_at||signed.content!==template.content||JSON.stringify(signed.tags)!==JSON.stringify(template.tags)||await getBrowserExtensionPubkey()!==actor)throw new Error("Signer returned a different identity or request.");await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);const confirmed=await read(invite.event.id);if(confirmed.current.acceptance?.id!==signed.id)throw new Error("Acceptance acknowledged, but confirmation incomplete. Reconnect before retrying.");setInvite(confirmed.current);setMessage("Accepted — you are hosting this one walk. No city-wide permissions were granted.");});}
 const occurrence=walk&&calendarOccurrence(walk);
 const wrongAccount=!!invite&&actor!==invite.control.nomineePubkey;
 return <main><AdminPageHeader eyebrow="Walk invitation" title="Review hosting request" description="The invitation is checked automatically for your connected account."/><AdminFeedback tone={failed||wrongAccount?"error":invite?.status==="accepted"?"success":"info"}>{busy?"Checking the signed invitation…":message}</AdminFeedback>{failed&&<AdminButton disabled={busy} onClick={()=>void load()}>Retry invitation</AdminButton>}{wrongAccount&&<section><h2>Use the invited account</h2><p>This browser is connected as:</p><EditorIdentity pubkey={actor} profile={profiles[actor]}/><p>The invitation was sent to:</p><EditorIdentity pubkey={invite.control.nomineePubkey} profile={profiles[invite.control.nomineePubkey]}/><p>Open the account menu above, choose <strong>Disconnect</strong>, then reconnect the invited account. The invitation link will remain here.</p></section>}{invite&&walk&&!wrongAccount&&<section><div><AdminStatusBadge tone={invite.status==="accepted"?"success":invite.status==="pending"?"info":"danger"}>{invite.status==="accepted"?"Accepted":invite.status==="pending"?"Ready to accept":"Unavailable"}</AdminStatusBadge></div><h2>{walk.tags.find(t=>t[0]==="title")?.[1]??"BitcoinWalk"}</h2>{occurrence&&<><p>{new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",...(occurrence.timeZone?{timeZone:occurrence.timeZone}:{})}).format(new Date(occurrence.start*1000))}{occurrence.timeZone?" ("+occurrence.timeZone+")":""}</p><p>{occurrence.meetingPoint.description}</p></>}<p>Invited by</p><EditorIdentity pubkey={invite.event.pubkey} profile={profiles[invite.event.pubkey]}/><p>Invited host</p><EditorIdentity pubkey={invite.control.nomineePubkey} profile={profiles[invite.control.nomineePubkey]}/><p>You are accepting responsibility to attend and host this date only. Your hosting identity will be public on this event. This does not grant city editing, other dates, cancellation or onward delegation. The city host and super-admin remain in control.</p>{invite.status==="pending"&&<><p><strong>Accept before:</strong> {new Date(invite.control.expiresAt*1000).toLocaleString()}</p><AdminButton variant="primary" disabled={busy} onClick={()=>void accept()}>Accept hosting this walk</AdminButton></>}{invite.status==="accepted"&&<p><Link href="/admin/walks">Open My walks</Link></p>}{href&&<p><Link href={href}>Open public walk</Link></p>}</section>}</main>;
}
