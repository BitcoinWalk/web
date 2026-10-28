"use client";
/* eslint-disable @next/next/no-img-element -- Integrity-checked private logo and same-origin OG previews. */
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
import ArtworkLifecycle,{type ArtworkStage} from "./artwork-lifecycle";
import styles from "../app/admin/sponsors/sponsors.module.css";

export default function SponsorOrderLogoReview({order,approved=false,onChanged}:{order:SponsorOrder;approved?:boolean;onChanged:()=>Promise<void>}){
 const dashboard=useDashboard(),lock=useRef(false),stageRef=useRef<ArtworkStage>(approved?"applied":"uploaded"),[stage,setStage]=useState<ArtworkStage>(approved?"applied":"uploaded"),[busy,setBusy]=useState(false),[preview,setPreview]=useState(""),[message,setMessage]=useState(""),[og,setOg]=useState(""),[ogLoaded,setOgLoaded]=useState(false);
 const move=(next:ArtworkStage)=>{stageRef.current=next;setStage(next);};
 async function actor(){const key=await getBrowserExtensionPubkey();if(!isSuperAdmin(key)||key!==dashboard.pubkey)throw new Error("Connect the super-admin identity.");return key;}
 async function promote(key:string){
  if(!order.pubkey||!order.logoHash)throw new Error("Logo unavailable.");
  const template=mediaRequestTemplate({action:"review-sponsor-logo",cityId:order.cityId,sponsorPubkey:order.pubkey}),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsors/logo/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"}),body=await response.json();
  if(!response.ok)throw new Error(body.error||"Approved logo could not be activated.");
  exactApprovedSponsorAsset(body,order.logoHash);
 }
 async function generate(key:string){
  if(!order.pubkey||!order.logoHash)throw new Error("Logo unavailable.");
  const cityIds=[...new Set(order.walks.map(walk=>walk.cityId??order.cityId))];let firstPath="";
  for(const targetCityId of cityIds){const template=mediaRequestTemplate({action:"generate-sponsor-composite",targetCityId,sourceCityId:order.cityId,sponsorPubkey:order.pubkey,hash:order.logoHash}),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");const response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Image generation failed.");if(await actor()!==key)throw new Error("Signer changed.");const path=sponsorOgPreviewPath(body);if(!firstPath)firstPath=path;}
  setOg(firstPath);setOgLoaded(false);return firstPath;
 }
 async function freshOrder(key:string){
  const template=sponsorRequest("list",window.location.origin),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsorships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"list",event}),cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Could not verify payment.");
  const fresh=(body.orders as SponsorOrder[]).find(value=>value.id===order.id);if(!fresh||fresh.pubkey!==order.pubkey||fresh.logoHash!==order.logoHash||fresh.cityId!==order.cityId||JSON.stringify(fresh.walks)!==JSON.stringify(order.walks))throw new Error("Order or artwork changed. Refresh payments and review again.");
  return fresh;
 }
 async function apply(fresh:SponsorOrder,key:string){
  const assignments=orderLogoAssignments(fresh,await querySponsorships(relayConfig.readRelays));
  for(const value of assignments){if(await actor()!==key)throw new Error("Signer changed.");const template=createSponsorshipRevision(value),signed=await signWithBrowserExtension(template);assertExactSigned(signed,template);if(signed.pubkey!==key)throw new Error("Signer changed.");await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);}
 }
 async function restore(address:string,cityId:string){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{
   const key=await actor(),value=restoreOrderWalkOg(order,address,await querySponsorships(relayConfig.readRelays),cityId);
   if(value){const template=createSponsorshipRevision(value),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");await publishVerifiedEvent(event,relayConfig.writeRelays,1,authenticateWithBrowserExtension);}
   move("uploaded");setOg("");setOgLoaded(false);setMessage("Default city OG image restored for this walk. Sponsorship remains active. Previously shared previews may be cached by other apps.");await onChanged();
  }catch(error){setMessage(error instanceof Error?error.message:"Could not restore the default OG image.");}finally{lock.current=false;setBusy(false);}
 }
 async function completeArtwork(){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage("Checking the paid order before artwork approval…");
  try{
   const key=await actor(),fresh=await freshOrder(key);
   setMessage("Approve the exact logo in your extension.");await promote(key);move("approved");
   setMessage("Logo approved. Generate the sponsored sharing image in your extension.");await generate(key);move("generated");
   setMessage("Image generated. Apply it to the signed walk assignment in your extension.");await apply(fresh,key);move("applied");setPreview("");
   setMessage("Artwork approved, generated and applied publicly. The sponsor has nothing else to do.");await onChanged().catch(()=>{/* The signed public result remains valid if list refresh fails. */});
  }catch(error){const prefix=stageRef.current==="approved"?"The logo is approved, but generation or application is incomplete. ":stageRef.current==="generated"?"The image is generated, but public application is incomplete. ":"Artwork setup is incomplete. ";setMessage(prefix+(error instanceof Error?error.message:"Refresh and retry."));}finally{lock.current=false;setBusy(false);}
 }
 async function refreshAppliedPreview(){if(lock.current)return;lock.current=true;setBusy(true);try{const key=await actor();setMessage("Refreshing the applied OG image preview…");await generate(key);setMessage("Public artwork remains applied. Loading its current preview…");}catch(error){setMessage(error instanceof Error?error.message:"Could not refresh the OG preview.");}finally{lock.current=false;setBusy(false);}}
 async function inspect(){if(lock.current||!order.pubkey||!order.logoHash)return;lock.current=true;setBusy(true);setPreview("");try{
  const key=await actor(),template=mediaRequestTemplate({action:"preview-sponsor-asset",cityId:order.cityId,sponsorPubkey:order.pubkey,hash:order.logoHash}),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==key)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error||"Logo unavailable.");
  if(typeof body.base64!=="string"||body.hash!==order.logoHash)throw new Error("Logo changed. Refresh payments before reviewing.");
  const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0)),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");if(hash!==order.logoHash)throw new Error("Logo integrity check failed.");
  if(await actor()!==key)throw new Error("Signer changed.");setPreview(body.base64);setMessage(`Review this exact logo. Continue will approve it, generate the sharing image, then apply it to the ${order.count===1?"walk":"walks"} listed above.`);
 }catch(error){setMessage(error instanceof Error?error.message:"Could not review logo.");}finally{lock.current=false;setBusy(false);}}
 return <div className={styles.publicationReview} aria-busy={busy}><header><strong>Publication review</strong><small>The sponsor is finished. BitcoinWalk completes these public artwork safeguards.</small></header><ArtworkLifecycle stage={stage}/><div className={styles.reviewActions}>{stage==="applied"?<button type="button" disabled={busy} onClick={()=>void refreshAppliedPreview()}>{busy?"Loading preview…":"Preview applied OG image"}</button>:preview?<button type="button" disabled={busy} onClick={()=>void completeArtwork()}>{busy?"Completing artwork…":"Approve, generate and apply"}</button>:stage==="uploaded"?<button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?"Working…":"Review logo"}</button>:<button type="button" disabled={busy} onClick={()=>void completeArtwork()}>{busy?"Completing artwork…":"Continue artwork setup"}</button>}</div>{preview&&stage!=="applied"&&<div className={styles.logoReviewPreview}><img src={`data:image/png;base64,${preview}`} alt={`Sponsor logo for ${order.cityName}`}/></div>}{stage==="applied"&&<details className={styles.restoreArtwork}><summary>Restore default city OG image</summary><p>Sign to remove the approved logo from a walk’s sharing image. The sponsor assignment remains active.</p>{order.walks.map(walk=>{const cityId=walk.cityId??order.cityId;return <div key={`${cityId}:${walk.address}`}><p>{walk.cityName&&<strong>{walk.cityName}: </strong>}{walk.label}</p><button type="button" disabled={busy} onClick={()=>void restore(walk.address,cityId)}>Sign and restore default city OG image</button></div>;})}</details>}{message&&<p className={styles.reviewMessage} role="status">{message}</p>}{og&&<figure className={styles.appliedArtwork}><img src={og} alt={`${order.cityName} OG image with approved sponsor logo`} onLoad={()=>{setOgLoaded(true);if(stageRef.current==="applied")setMessage("Artwork is applied publicly and the current OG image loaded successfully.");}} onError={()=>{setOgLoaded(false);setMessage("The artwork state is saved, but the preview could not be loaded. Retry or open the full-size image.");}}/>{ogLoaded&&<figcaption>Applied OG image preview · 1200 × 630</figcaption>}<p><a href={og} target="_blank" rel="noopener noreferrer">Open full-size OG image</a></p></figure>}</div>;
}
