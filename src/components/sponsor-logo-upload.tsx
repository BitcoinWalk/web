"use client";
import {useState,useRef} from "react";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {mediaRequestTemplate} from "../domain/media-request";
import {querySponsorships,latestSponsorships} from "../nostr/sponsorships";
import {relayConfig} from "../lib/relay-config";
import {isSuperAdmin} from "../nostr/authority";
import {assertExactSigned} from "../nostr/moderation";

import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";

type Assignment={cityId:string;sponsorPubkey:string};
export default function SponsorLogoUpload({cityId,sponsorPubkey}:{cityId:string;sponsorPubkey:string}) {
  const dashboard=useDashboard();
  const [rows,setRows]=useState<Assignment[]>([]),[selection,setSelection]=useState(""),[file,setFile]=useState<File|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  async function loadAssignments(){if(lock.current)return;lock.current=true;setBusy(true);try{
    if(!isSuperAdmin(dashboard.pubkey))throw new Error("Connect the super-admin identity.");
    const assignments=latestSponsorships(await querySponsorships(relayConfig.readRelays)).flatMap(row=>row.sponsorship.scope.cityId===cityId&&row.sponsorship.sponsorPubkey===sponsorPubkey&&row.sponsorship.mode==="sponsor"&&row.sponsorship.sponsorPubkey?[{cityId:row.sponsorship.scope.cityId,sponsorPubkey:row.sponsorship.sponsorPubkey}]:[]);
    const unique=[...new Map(assignments.map(row=>[`${row.cityId}:${row.sponsorPubkey}`,row])).values()];
    setRows(unique);setSelection(unique[0]?`${unique[0].cityId}:${unique[0].sponsorPubkey}`:"");setMessage(unique.length?"":"No signed sponsor assignment was found. Save the sponsor assignment before uploading artwork.");
  }catch{setMessage("Could not read the signed sponsor assignment. Retry shortly.");}finally{lock.current=false;setBusy(false);}}
  useDashboardAutoLoad(loadAssignments);
  async function upload(){if(lock.current||!file)return;lock.current=true;setBusy(true);try{
    const assigned=rows.find(row=>`${row.cityId}:${row.sponsorPubkey}`===selection);if(!assigned)throw new Error("Choose an assignment.");
    const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor)||actor!==dashboard.pubkey)throw new Error("Connect the BitcoinWalk super-admin identity.");
    if(!["image/png","image/webp","image/svg+xml"].includes(file.type)||file.size>5*1024*1024||file.size===0)throw new Error("Use PNG, WebP or SVG, up to 5 MB. JPEG is not accepted.");
    const bytes=new Uint8Array(await file.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
    const template=mediaRequestTemplate({action:"upload-sponsor-logo",...assigned,sha256,mime:file.type as "image/png"|"image/webp"|"image/svg+xml"});
    setMessage("Sign the upload authorization in your Nostr extension. This does not approve or publish the logo.");
    const event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==actor)throw new Error("Unexpected signer identity.");
    let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const response=await fetch("/api/sponsors/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,base64:btoa(binary)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Upload failed.");
    setMessage(`Logo uploaded privately. Review the image below, then sign to approve this exact asset. It is not used in link previews yet. Asset: ${result.hash}`);
  }catch(error){setMessage(error instanceof Error?error.message:"Upload failed.");}finally{lock.current=false;setBusy(false);}}
  return <section><details><summary>What logo format and size should I use?</summary><p>Use a transparent PNG or WebP, or an outlined SVG. JPEG and Nostr profile pictures are not imported. Maximum 5 MB; SVG maximum 512 KB with no fonts, embedded images, scripts, styles or external resources.</p><ul><li>Use a horizontal logo with an aspect ratio close to 4:1.</li><li>For PNG or WebP, 1024 × 256 pixels is ideal; use at least 640 × 160 pixels for a crisp result.</li><li>Use a transparent background, keep the artwork tightly cropped, and leave a small clear margin around it.</li><li>Square or vertical logos are accepted, but will appear smaller because the final sponsor area is 320 × 80 pixels.</li><li>For SVG, convert text to outlines and use a similarly wide viewBox.</li></ul><p>Uploading and approval are separate signed actions. After upload, review the exact image below and sign its approval before it can appear in link previews.</p></details>{rows.length>0&&<><label>Choose logo file<input type="file" accept="image/png,image/webp,image/svg+xml" disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)}/></label><button disabled={busy||!file} onClick={()=>void upload()}>Sign and upload for review</button></>}{message&&<p role="status">{message}</p>}</section>;
}
