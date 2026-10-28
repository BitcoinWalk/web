"use client";

import Image from "next/image";
import {useState} from "react";
import type {SponsorOrder} from "../../payments/sponsor-types";
import styles from "./sponsor.module.css";

function base64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}

export default function SponsorDraft({order,token,onUpdated}:{order:SponsorOrder;token:string;onUpdated:(order:SponsorOrder)=>void}){
 const [name,setName]=useState(order.draftName??""),[website,setWebsite]=useState(order.draftWebsite??""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(order.logoHash?"Your private sponsor details and logo are saved.":"Add only what you want now. You can return with your recovery file."),[preview,setPreview]=useState("");
 async function request(url:string,body:unknown){const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(60000)}),result=await response.json();if(!response.ok)throw new Error(result.error||"Sponsor draft could not be saved.");return result;}
 async function save(){if(busy)return;setBusy(true);setMessage("");try{const result=await request("/api/sponsorships",{action:"save-draft",id:order.id,token,name,website});onUpdated(result.order);setName(result.order.draftName??"");setWebsite(result.order.draftWebsite??"");setMessage("Private sponsor details saved. Nothing has been published.");}catch(error){setMessage(error instanceof Error?error.message:"Sponsor details could not be saved.");}finally{setBusy(false);}}
 async function upload(){if(busy||!file)return;setBusy(true);setMessage("");try{if(!["image/png","image/webp","image/svg+xml"].includes(file.type)||file.size===0||file.size>5*1024*1024)throw new Error("Choose a PNG, WebP or outlined SVG within 5 MB. JPEG is not accepted.");if(file.type==="image/svg+xml"&&file.size>512*1024)throw new Error("SVG logos must be 512 KB or smaller.");const bytes=new Uint8Array(await file.arrayBuffer()),sha256=hex(await crypto.subtle.digest("SHA-256",bytes)),result=await request("/api/sponsors/logo",{action:"upload-paid-sponsor-draft-logo",orderId:order.id,cityId:order.cityId,token,sha256,mime:file.type,base64:base64(bytes)});if(!/^[a-f0-9]{64}$/.test(result.hash))throw new Error("The saved logo response was invalid.");if(result.linkPreview?.mime==="image/jpeg"&&typeof result.linkPreview.base64==="string")setPreview(`data:image/jpeg;base64,${result.linkPreview.base64}`);setFile(null);onUpdated({...order,logoHash:result.hash});setMessage("Logo saved privately. It is not approved, public or reusable yet.");}catch(error){setMessage(error instanceof Error?error.message:"Logo draft could not be saved.");}finally{setBusy(false);}}
 return <section className={styles.sponsorDraft} aria-labelledby="private-sponsor-draft">
  <p className={styles.artworkStep}>Payment confirmed · Recovery saved</p>
  <h3 id="private-sponsor-draft">Add sponsor details <small>Optional</small></h3>
  <p>You can save a private draft now and connect a Nostr identity later. A draft never publishes or approves a sponsor.</p>
  <div className={styles.draftFields}><label>Business or project name<input value={name} maxLength={80} disabled={busy} onChange={event=>setName(event.target.value)} placeholder="Your sponsor name"/></label><label>Website <span>optional</span><input type="url" value={website} maxLength={2048} disabled={busy} onChange={event=>setWebsite(event.target.value)} placeholder="https://example.com"/></label></div>
  <button type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save private details"}</button>
  <details><summary>{order.logoHash?"Replace private logo draft":"Add a logo draft"}</summary><p>PNG, WebP or outlined SVG. BitcoinWalk will review it separately before any public use.</p><label className={styles.logoPicker}>Choose logo file<input type="file" accept="image/png,image/webp,image/svg+xml" disabled={busy} onChange={event=>setFile(event.target.files?.[0]??null)}/></label><button type="button" disabled={busy||!file} onClick={()=>void upload()}>{busy?"Uploading…":"Save logo privately"}</button></details>
  {preview&&<Image unoptimized src={preview} width={600} height={315} alt={`Private ${order.cityName} sponsored link draft`} className={styles.draftPreview}/>}<p role="status">{message}</p>
  <div className={styles.finishLater}><strong>You can stop here.</strong><span>Your payment and private draft are saved. Use your recovery file to continue on any device.</span></div>
 </section>;
}
