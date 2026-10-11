"use client";
/* eslint-disable @next/next/no-img-element -- Integrity-checked private logo preview. */
import {useRef,useState} from "react";
import type {SponsorOrder} from "../payments/sponsor-types";
import {sponsorRequest} from "../payments/sponsor-auth";
import {mediaRequestTemplate} from "../domain/media-request";
import {orderLogoAssignments,restoreOrderWalkOg} from "../domain/sponsor-order-approval";
import {exactApprovedSponsorAsset,sponsorOgPreviewPath} from "../domain/sponsor-og-preview";
import {isSuperAdmin} from "../nostr/authority";
import {getBrowserExtensionPubkey,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {assertExactSigned} from "../nostr/moderation";
import {createSponsorshipRevision,querySponsorships} from "../nostr/sponsorships";
import {publishVerifiedEvent} from "../nostr/relay";
import {relayConfig} from "../lib/relay-config";
import {useDashboard} from "./dashboard-context";

export default function SponsorOrderLogoReview({order,approved=false,onChanged}:{order:SponsorOrder;approved?:boolean;onChanged:()=>Promise<void>}){
 const dashboard=useDashboard(),lock=useRef(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState(""),[message,setMessage]=useState(""),[approvedNow,setApprovedNow]=useState(false),[og,setOg]=useState(""),[ogLoaded,setOgLoaded]=useState(false);
 const complete=approved||approvedNow;
 async function actor(){const key=await getBrowserExtensionPubkey();if(!isSuperAdmin(key)||key!==dashboard.pubkey)throw new Error("Connect the super-admin identity.");return key;}
 async function promote(){
  if(!order.pubkey||!order.logoHash)throw new Error("Logo unavailable.");
  const key=await actor(),template=mediaRequestTemplate({action:"review-sponsor-logo",cityId:order.cityId,sponsorPubkey:order.pubkey}),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsors/logo/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"}),body=await response.json();
  if(!response.ok)throw new Error(body.error||"Approved logo could not be activated.");
  exactApprovedSponsorAsset(body,order.logoHash);
 }
 async function restore(address:string){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{
   const key=await actor(),value=restoreOrderWalkOg(order,address,await querySponsorships(relayConfig.readRelays));
   if(value){const template=createSponsorshipRevision(value),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");await publishVerifiedEvent(event,relayConfig.writeRelays,1,authenticateWithBrowserExtension);}
   setApprovedNow(false);setOg("");setOgLoaded(false);setMessage("Default city OG image restored for this walk. Sponsorship remains active. Previously shared previews may be cached by other apps.");await onChanged();
  }catch(error){setMessage(error instanceof Error?error.message:"Could not restore the default OG image.");}finally{lock.current=false;setBusy(false);}
 }
 async function generate(){
  setOg("");setOgLoaded(false);setMessage("Logo approved. Generating your OG image… Please confirm the image-generation request in your extension.");
  try{
   if(!order.pubkey||!order.logoHash)throw new Error("Logo unavailable.");
   await promote();
   const key=await actor(),template=mediaRequestTemplate({action:"generate-sponsor-composite",targetCityId:order.cityId,sourceCityId:order.cityId,sponsorPubkey:order.pubkey,hash:order.logoHash}),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
   const response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Image generation failed.");
   if(await actor()!==key)throw new Error("Signer changed.");
   setOg(sponsorOgPreviewPath(body));setMessage("OG image generated. Loading preview…");
  }catch(error){setMessage(`Logo remains approved. The OG image could not be generated. ${error instanceof Error?error.message:"Please retry."}`);}
 }
 async function retryImage(){if(lock.current)return;lock.current=true;setBusy(true);try{await generate();}finally{lock.current=false;setBusy(false);}}
 async function inspect(){if(lock.current||!order.pubkey||!order.logoHash)return;lock.current=true;setBusy(true);setPreview("");try{
  const key=await actor(),template=mediaRequestTemplate({action:"preview-sponsor-asset",cityId:order.cityId,sponsorPubkey:order.pubkey,hash:order.logoHash}),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Logo unavailable.");
  if(typeof body.base64!=="string"||body.hash!==order.logoHash)throw new Error("Logo changed. Refresh payments before reviewing.");
  const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0)),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");if(hash!==order.logoHash)throw new Error("Logo integrity check failed.");
  if(await actor()!==key)throw new Error("Signer changed.");setPreview(body.base64);setMessage(`Approve this logo for the ${order.count===1?"walk":"walks"} listed above. Your extension will request a signature for each assignment that needs approval.`);
 }catch(error){setMessage(error instanceof Error?error.message:"Could not review logo.");}finally{lock.current=false;setBusy(false);}}
 async function approve(){if(lock.current||!preview)return;lock.current=true;setBusy(true);try{
  const key=await actor(),template=sponsorRequest("list",window.location.origin),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsorships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"list",event}),cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Could not verify payment.");
  const fresh=(body.orders as SponsorOrder[]).find(value=>value.id===order.id);if(!fresh||fresh.pubkey!==order.pubkey||fresh.logoHash!==order.logoHash||fresh.cityId!==order.cityId||JSON.stringify(fresh.walks)!==JSON.stringify(order.walks))throw new Error("Order or artwork changed. Refresh payments and review again.");
  const assignments=orderLogoAssignments(fresh,await querySponsorships(relayConfig.readRelays));
  for(const value of assignments){if(await actor()!==key)throw new Error("Signer changed.");const template=createSponsorshipRevision(value),signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);if(signed.pubkey!==key)throw new Error("Signer changed.");await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);}
  setPreview("");setApprovedNow(true);await generate();await onChanged().catch(()=>{/* Approval and image results remain valid if the list refresh fails. */});
 }catch(error){setMessage(error instanceof Error?error.message:"Approval failed. Refresh to see any walks already approved, then retry the remaining walks.");}finally{lock.current=false;setBusy(false);}}
 return <div aria-busy={busy}>{complete?<button type="button" disabled={busy} onClick={()=>void retryImage()}>{busy?"Generating OG image…":"Generate / preview OG image"}</button>:<button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?"Working…":"Review logo"}</button>}{preview&&!complete&&<><div style={{background:"#e5e7eb",padding:20,marginTop:12}}><img src={`data:image/png;base64,${preview}`} alt={`Sponsor logo for ${order.cityName}`} style={{maxWidth:"100%",maxHeight:200}}/></div><button type="button" style={{background:"#ff9713",color:"#20262d",marginTop:12}} disabled={busy} onClick={()=>void approve()}>Sign and approve logo</button></>}{complete&&<details><summary>Restore default city OG image</summary><p>Sign to remove the approved logo from a walk’s sharing image. The sponsor assignment remains active.</p>{order.walks.map(walk=><div key={walk.address}><p>{walk.label}</p><button type="button" disabled={busy} onClick={()=>void restore(walk.address)}>Sign and restore default city OG image</button></div>)}</details>}{message&&<p role="status">{message}</p>}{og&&<figure style={{margin:"16px 0"}}><img src={og} alt={`${order.cityName} OG image with approved sponsor logo`} style={{width:"100%",maxWidth:600,height:"auto",borderRadius:8}} onLoad={()=>{setOgLoaded(true);setMessage("Logo approved and OG image generated successfully.");}} onError={()=>{setOgLoaded(false);setMessage("Logo approved and OG image generated, but the preview could not be loaded. Retry or open the full-size image.");}}/>{ogLoaded&&<figcaption>OG image preview · 1200 × 630</figcaption>}<p><a href={og} target="_blank" rel="noopener noreferrer">Open full-size OG image</a></p></figure>}</div>;
}
