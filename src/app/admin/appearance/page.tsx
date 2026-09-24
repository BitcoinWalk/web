"use client";

import {useRef,useState,type FormEvent} from "react";
import {useDashboard,useDashboardAutoLoad} from "../../../components/dashboard-context";
import type {CityRevision} from "../../../nostr/city-records";
import {queryAuthorizations,queryDirectoryRecords} from "../../../nostr/city-records";
import {editableCityRevisions,editedCity} from "../../../nostr/organizer-edit";
import {createCityUpdateEvent} from "../../../nostr/city-event";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../../../nostr/signer";
import {publishVerifiedEvent} from "../../../nostr/relay";
import {relayConfig} from "../../../lib/relay-config";

export default function WalkPhotoPage(){
 const dashboard=useDashboard(),lock=useRef(false),[cities,setCities]=useState<CityRevision[]>([]),[selected,setSelected]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("Connect your organizer identity to load approved cities."),[submitted,setSubmitted]=useState(false);
 async function load(){if(lock.current||!dashboard.pubkey)return;lock.current=true;setBusy(true);setSubmitted(false);try{
  if(await getBrowserExtensionPubkey()!==dashboard.pubkey)throw new Error("Signer changed. Reconnect first.");
  const [grants,{revisions,approvals}]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryDirectoryRecords(relayConfig.readRelays)]);
  const available=editableCityRevisions(dashboard.pubkey,grants,revisions,approvals).filter(city=>!dashboard.selectedCity||city.city.cityId===dashboard.selectedCity);
  setCities(available);setSelected(current=>available.some(city=>city.city.cityId===current)?current:available[0]?.city.cityId??"");setMessage(available.length?"Choose a replacement landscape image. Changes require review before becoming public.":"No approved editable city was found for this identity.");
 }catch(error){setMessage(error instanceof Error?error.message:"Could not load city photos.");}finally{lock.current=false;setBusy(false);}}
 useDashboardAutoLoad(load);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(lock.current||submitted)return;const base=cities.find(city=>city.city.cityId===selected);if(!base)return;const url=String(new FormData(event.currentTarget).get("heroImageUrl")).trim();
  try{if(!url.startsWith("https://"))throw new Error("Use an HTTPS image URL.");new URL(url);}catch(error){setMessage(error instanceof Error?error.message:"Enter a valid HTTPS image URL.");return;}
  lock.current=true;setBusy(true);try{const key=await getBrowserExtensionPubkey();if(key!==dashboard.pubkey)throw new Error("Signer changed. Reconnect first.");
   const candidate=editedCity(base.city,{startAt:base.city.startAt,description:base.city.description,meetingPoint:base.city.meetingPoint,heroImageUrl:url});
   const signed=await signWithBrowserExtension(createCityUpdateEvent(candidate,base.event.id));if(signed.pubkey!==key)throw new Error("Signer identity changed; nothing was submitted.");
   const publication=await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);setSubmitted(true);setMessage(`Photo revision submitted to ${publication.accepted.length} relay(s). The current public image remains until super-admin approval.`);
  }catch(error){setMessage(error instanceof Error?error.message:"Could not submit the photo revision.");}finally{lock.current=false;setBusy(false);}}
 const base=cities.find(city=>city.city.cityId===selected);
 return <main><p>BitcoinWalk / dashboard / walk photo</p><h1>Walk photo</h1><p>The initial landscape is chosen during approval. You can replace the fallback image later; forecast imagery still appears when available.</p><button disabled={busy} onClick={load}>{busy?"Loading…":"Refresh cities"}</button><p role="status">{message}</p>{cities.length>1&&<label>City <select disabled={busy||submitted} value={selected} onChange={event=>{setSelected(event.target.value);setSubmitted(false);}}>{cities.map(city=><option key={city.city.cityId} value={city.city.cityId}>{city.city.cityName}</option>)}</select></label>}{base&&<form key={base.event.id} onSubmit={submit}><label>Landscape image URL <input name="heroImageUrl" type="url" required defaultValue={base.city.heroImageUrl??""} placeholder="https://…"/></label><p>Use a landscape or street-art photograph without identifiable people. The photo is a fallback when a weather-specific image is unavailable.</p><button disabled={busy||submitted} type="submit">Submit replacement for approval</button></form>}</main>;
}
