"use client";
/* eslint-disable @next/next/no-img-element -- Integrity-checked private logo preview. */
import {useRef,useState} from "react";
import type {SponsorOrder} from "../payments/sponsor-types";
import {sponsorRequest} from "../payments/sponsor-auth";
import {mediaRequestTemplate} from "../domain/media-request";
import {orderLogoAssignments} from "../domain/sponsor-order-approval";
import {isSuperAdmin} from "../nostr/authority";
import {getBrowserExtensionPubkey,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {assertExactSigned} from "../nostr/moderation";
import {createSponsorshipRevision,querySponsorships} from "../nostr/sponsorships";
import {publishVerifiedEvent} from "../nostr/relay";
import {relayConfig} from "../lib/relay-config";
import {useDashboard} from "./dashboard-context";

export default function SponsorOrderLogoReview({order,onChanged}:{order:SponsorOrder;onChanged:()=>Promise<void>}){
 const dashboard=useDashboard(),lock=useRef(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState(""),[message,setMessage]=useState("");
 async function actor(){const key=await getBrowserExtensionPubkey();if(!isSuperAdmin(key)||key!==dashboard.pubkey)throw new Error("Connect the super-admin identity.");return key;}
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
  setPreview("");setMessage("Logo approved for the purchased walks.");await onChanged();
 }catch(error){setMessage(error instanceof Error?error.message:"Approval failed. Refresh to see any walks already approved, then retry the remaining walks.");}finally{lock.current=false;setBusy(false);}}
 return <div><button type="button" disabled={busy} onClick={()=>void inspect()}>{busy?"Working…":"Review logo"}</button>{preview&&<><div style={{background:"#e5e7eb",padding:20,marginTop:12}}><img src={`data:image/png;base64,${preview}`} alt={`Sponsor logo for ${order.cityName}`} style={{maxWidth:"100%",maxHeight:200}}/></div><button type="button" style={{background:"#ff9713",color:"#20262d",marginTop:12}} disabled={busy} onClick={()=>void approve()}>Sign and approve logo</button></>}{message&&<p role="status">{message}</p>}</div>;
}
