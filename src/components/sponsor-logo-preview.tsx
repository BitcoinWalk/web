"use client";
/* eslint-disable @next/next/no-img-element -- Private integrity-checked image data. */
import {useCallback,useEffect,useState} from "react";
import {useDashboard} from "./dashboard-context";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {mediaRequestTemplate} from "../domain/media-request";
import {assertExactSigned} from "../nostr/moderation";
export default function SponsorLogoPreview({cityId,sponsorPubkey,hash}:{cityId:string;sponsorPubkey:string;hash:string}){
 const dashboard=useDashboard(),[image,setImage]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(true);
 const preview=useCallback(async(isCurrent:()=>boolean=()=>true)=>{if(!isCurrent())return;setBusy(true);setMessage("");setImage("");try{const actor=await getBrowserExtensionPubkey();if(!isCurrent())return;if(!isSuperAdmin(actor)||actor!==dashboard.pubkey)throw new Error("Connect the super-admin identity.");const template=mediaRequestTemplate({action:"preview-sponsor-asset",cityId,sponsorPubkey,hash}),event=await signWithBrowserExtension(template);if(!isCurrent())return;assertExactSigned(event,template);if(event.pubkey!==actor)throw new Error("Signer changed.");const response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event})}),body=await response.json();if(!response.ok)throw new Error(body.error||"Preview unavailable.");const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0)),digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");if(digest!==hash||body.hash!==hash)throw new Error("Logo integrity check failed.");if(isCurrent())setImage(body.base64);}catch(error){if(isCurrent())setMessage(error instanceof Error?error.message:"Preview unavailable.");}finally{if(isCurrent())setBusy(false);}},[cityId,sponsorPubkey,hash,dashboard.pubkey]);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)void preview(()=>active);});return()=>{active=false;};},[preview]);
 return <div><p>Saved sponsor logo selected. Saving this assignment will include it.</p>{image?<div style={{background:"#888",padding:16}}><img alt="Selected sponsor logo" src={`data:image/png;base64,${image}`} style={{maxWidth:320,maxHeight:160}}/></div>:busy?<p role="status">Loading logo preview… Authorize private access in your signer if prompted.</p>:<button type="button" onClick={()=>void preview()}>Retry logo preview</button>}{message&&<p role="status">{message}</p>}</div>;
}
