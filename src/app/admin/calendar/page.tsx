"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import type {Event} from "nostr-tools";
import {relayConfig} from "../../../lib/relay-config";
import {isSuperAdmin} from "../../../nostr/authority";
import {loadCalendarWalks,matchesCalendar,calendarNevent,type CalendarWalk} from "../../../nostr/calendar-records";
import {queryCalendarEvents} from "../../../nostr/city-records";
import {createApprovedCalendarEvent} from "../../../nostr/calendar-event";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../../../nostr/signer";
import {publishVerifiedEvent} from "../../../nostr/relay";
import CalendarShare from "../../../components/calendar-share";

export default function CalendarAdminPage(){
  const lock=useRef(false);
  const [busy,setBusy]=useState(false),[walks,setWalks]=useState<CalendarWalk[]>([]),[published,setPublished]=useState<Record<string,Event>>({});
  const [message,setMessage]=useState("Connect the super-admin to load approved walks. Nothing is published automatically.");
  async function admin(){const key=await getBrowserExtensionPubkey();if(!isSuperAdmin(key))throw new Error("Select the BitcoinWalk super-admin in your extension.");return key;}
  async function load(){
    if(lock.current)return;lock.current=true;setBusy(true);setWalks([]);setPublished({});
    try{await admin();setMessage("Loading approved walks…");const available=await loadCalendarWalks(relayConfig.readRelays);const events=await queryCalendarEvents(relayConfig.readRelays);await admin();setWalks(available);
      const known:Record<string,Event>={};for(const walk of available){const event=events.find(e=>matchesCalendar(e,walk));if(event)known[walk.revision.city.cityId]=event;}setPublished(known);setMessage(`${available.length} approved walks loaded. Publishing requires an additional signature.`);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load calendar data.");}finally{lock.current=false;setBusy(false);}
  }
  async function publish(walk:CalendarWalk){
    if(lock.current)return;lock.current=true;setBusy(true);
    try{
      const actor=await admin();const city=walk.revision.city;
      if(!relayConfig.writeRelays.length)throw new Error("No write relay configured.");
      setMessage("Checking the current approval…");
      const current=(await loadCalendarWalks(relayConfig.writeRelays)).find(w=>w.revision.city.cityId===city.cityId);
      if(!current||current.revision.event.id!==walk.revision.event.id||current.approval.event.id!==walk.approval.event.id)throw new Error("Approval changed. Reload the list before publishing.");
      const existing=(await queryCalendarEvents(relayConfig.writeRelays,{cityId:city.cityId})).find(e=>matchesCalendar(e,current));
      if(existing){setPublished(p=>({...p,[city.cityId]:existing}));setMessage("This approved revision is already published. Its existing link is shown below.");return;}
      if(!window.confirm(`Publish BitcoinWalk ${city.cityName} as a public Nostr calendar event?\n${new Date(city.startAt).toLocaleString()}\n${city.meetingPoint.description}\n\nDestination: ${relayConfig.writeRelays.join(", ")}\nExternal apps may retain copies. This does not publish to other relays.`)){setMessage("Cancelled. No calendar event published.");return;}
      const template=createApprovedCalendarEvent(city,walk.revision.event.id,walk.approval.event.id);
      setMessage("Approve the calendar signature and relay authentication in your extension…");
      const signed=await signWithBrowserExtension(template);
      if(await admin()!==actor||signed.created_at!==template.created_at||!matchesCalendar(signed,current))throw new Error("Signer returned an unexpected account or event. Nothing was published.");
      await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      const result=(await queryCalendarEvents(relayConfig.writeRelays,{ids:[signed.id]})).find(e=>e.id===signed.id&&matchesCalendar(e,current));
      if(!result)throw new Error("Publication was acknowledged, but read-back could not be confirmed. Reload before retrying.");
      setPublished(p=>({...p,[city.cityId]:result}));setMessage(`Published and read back: BitcoinWalk ${city.cityName}. Its share link is below. Third-party discovery is not yet verified.`);
    }catch(e){setMessage(e instanceof Error?e.message:"Calendar publication failed.");}finally{lock.current=false;setBusy(false);}
  }
  return <main><p>BitcoinWalk / admin / calendar</p><h1>Publish approved walks</h1><p><Link href="/admin">City approvals</Link>{" · "}<Link href="/">City directory</Link></p><p>Staging only: {relayConfig.writeRelays.join(", ")}. One current scheduled walk per city; rescheduling replaces its calendar entry. No recurring schedule or external-relay distribution is enabled.</p><button disabled={busy} onClick={load}>Connect and load approved walks</button><p role="status">{message}</p>{walks.map(walk=>{const city=walk.revision.city,event=published[city.cityId];return <article key={city.cityId}><h2>{city.cityName}</h2><p>{new Date(city.startAt).toLocaleString()} · {city.meetingPoint.description}</p><p style={{whiteSpace:"pre-wrap"}}>{city.description}</p><details><summary>Approved source</summary><p>City: {city.cityId}<br/>Revision: {walk.revision.event.id}<br/>Approval: {walk.approval.event.id}</p></details>{event?<CalendarShare nevent={calendarNevent(event,relayConfig.readRelays)}/>:<button disabled={busy} onClick={()=>publish(walk)}>Sign and publish calendar event</button>}<hr/></article>;})}</main>;
}
