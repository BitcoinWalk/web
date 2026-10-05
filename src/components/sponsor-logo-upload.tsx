"use client";
import {useState,useRef} from "react";
import {nip19} from "nostr-tools";
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
  const [actor,setActor]=useState(""),[rows,setRows]=useState<Assignment[]>([]),[selection,setSelection]=useState(""),[file,setFile]=useState<File|null>(null),[message,setMessage]=useState("Connect the super-admin identity to upload sponsor artwork."),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  async function connect(){if(lock.current)return;lock.current=true;setBusy(true);try{
    const identity=await getBrowserExtensionPubkey();
    if(!isSuperAdmin(identity)||identity!==dashboard.pubkey)throw new Error("Connect the super-admin identity.");
    const assignments=latestSponsorships(await querySponsorships(relayConfig.readRelays)).flatMap(row=>row.sponsorship.scope.cityId===cityId&&row.sponsorship.sponsorPubkey===sponsorPubkey&&row.sponsorship.mode==="sponsor"&&row.sponsorship.sponsorPubkey&&(row.sponsorship.sponsorPubkey===identity||isSuperAdmin(identity))?[{cityId:row.sponsorship.scope.cityId,sponsorPubkey:row.sponsorship.sponsorPubkey}]:[]);
    const unique=[...new Map(assignments.map(row=>[`${row.cityId}:${row.sponsorPubkey}`,row])).values()];
    setActor(identity);setRows(unique);setSelection(unique[0]?`${unique[0].cityId}:${unique[0].sponsorPubkey}`:"");setMessage(unique.length?"Upload artwork for the assignment selected above.":"No signed sponsor assignment was found for this identity. Ask the super-admin to assign your sponsorship first.");
  }catch{setMessage("Could not connect or read assignments. Check your signer and try again.");}finally{lock.current=false;setBusy(false);}}
  useDashboardAutoLoad(connect);
  async function upload(){if(lock.current||!file)return;lock.current=true;setBusy(true);try{
    const assigned=rows.find(row=>`${row.cityId}:${row.sponsorPubkey}`===selection);if(!assigned)throw new Error("Choose an assignment.");
    if(!isSuperAdmin(actor)||actor!==dashboard.pubkey||await getBrowserExtensionPubkey()!==actor)throw new Error("Signer identity changed. Connect again.");
    if(!["image/png","image/webp","image/svg+xml"].includes(file.type)||file.size>5*1024*1024||file.size===0)throw new Error("Use PNG, WebP or SVG, up to 5 MB. JPEG is not accepted.");
    const bytes=new Uint8Array(await file.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
    const template=mediaRequestTemplate({action:"upload-sponsor-logo",...assigned,sha256,mime:file.type as "image/png"|"image/webp"|"image/svg+xml"});
    setMessage("Sign the upload authorization in your Nostr extension. This does not approve or publish the logo.");
    const event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==actor)throw new Error("Unexpected signer identity.");
    let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const response=await fetch("/api/sponsors/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,base64:btoa(binary)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Upload failed.");
    setMessage(`Logo uploaded privately. Pending super-admin approval; it is not displayed in link previews. Asset: ${result.hash}`);
  }catch(error){setMessage(error instanceof Error?error.message:"Upload failed.");}finally{lock.current=false;setBusy(false);}}
  return <section><h2>Upload sponsor logo</h2><p>Use a transparent PNG or WebP, or an outlined SVG. JPEG and Nostr profile pictures are not imported. Maximum 5 MB; SVG maximum 512 KB with no fonts, embedded images, scripts, styles or external resources.</p><p>Uploading is not approval. Your logo stays private until reviewed by the BitcoinWalk super-admin.</p><button disabled={busy} onClick={()=>void connect()}>{actor?"Refresh connection and assignments":"Connect Nostr signer"}</button>{actor&&<p>Connected: {nip19.npubEncode(actor)}</p>}{rows.length>0&&<><label>Logo file<input type="file" accept="image/png,image/webp,image/svg+xml" disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)}/></label><button disabled={busy||!file} onClick={()=>void upload()}>Sign and upload for review</button></>}<p role="status">{message}</p></section>;
}
