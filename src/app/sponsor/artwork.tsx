"use client";

import {useState,useRef} from "react";
import {mediaRequestTemplate} from "../../domain/media-request";
import {signForOrganizer} from "../../nostr/organizer-identity";
import type {SponsorOrder} from "../../payments/sponsor-types";
import styles from "./sponsor.module.css";

function base64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}

export default function PaidSponsorArtwork({order,token,onUploaded}:{order:SponsorOrder;token:string;onUploaded:(hash:string)=>void}){
 const [file,setFile]=useState<File|null>(null),[logoHash,setLogoHash]=useState(order.logoHash),[image,setImage]=useState<{url:string;name:string}|null>(null),[message,setMessage]=useState(order.logoHash?"Your uploaded logo is ready for a new private OG preview.":"Choose your logo after reading the format guide."),[busy,setBusy]=useState(false),lock=useRef(false);
 const [changingLogo,setChangingLogo]=useState(false);
 const sponsorPubkey=order.pubkey,needsUpload=!logoHash||changingLogo;
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await work();}catch(error){setMessage(error instanceof Error?error.message:"Artwork request failed.");}finally{lock.current=false;setBusy(false);}}
 async function upload(){if(!file||!sponsorPubkey)return;await run(async()=>{
  if(!["image/png","image/webp","image/svg+xml"].includes(file.type)||file.size===0||file.size>5*1024*1024)throw new Error("Choose a PNG, WebP or outlined SVG within the stated size limit. JPEG is not accepted.");
  if(file.type==="image/svg+xml"&&file.size>512*1024)throw new Error("SVG logos must be 512 KB or smaller.");
  const bytes=new Uint8Array(await file.arrayBuffer()),sha256=hex(await crypto.subtle.digest("SHA-256",bytes)),template=mediaRequestTemplate({action:"upload-paid-sponsor-logo",orderId:order.id,cityId:order.cityId,sponsorPubkey,sha256,mime:file.type as "image/png"|"image/webp"|"image/svg+xml"});
  setMessage("Sign the private logo upload with the sponsor identity. This does not publish or approve the artwork.");
  const event=await signForOrganizer(template,sponsorPubkey),response=await fetch("/api/sponsors/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,token,base64:base64(bytes)})}),result=await response.json();
  if(!response.ok)throw new Error(result.error||"Logo upload failed.");
  if(!/^[a-f0-9]{64}$/.test(result.hash))throw new Error("The stored logo response was invalid.");
  setLogoHash(result.hash);setFile(null);setChangingLogo(false);setImage(null);onUploaded(result.hash);setMessage("Logo saved. Next, create your share image. Public placement still needs BitcoinWalk approval.");
 });}
 async function build(){if(!logoHash||!sponsorPubkey)return;await run(async()=>{
  const template=mediaRequestTemplate({action:"generate-paid-sponsor-composite",orderId:order.id,cityId:order.cityId,sponsorPubkey,hash:logoHash}),event=await signForOrganizer(template,sponsorPubkey),response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,token})}),result=await response.json();
  if(!response.ok)throw new Error(result.error||"Could not build the OG image.");
  if(result.mime!=="image/jpeg"||result.width!==1200||result.height!==630||typeof result.base64!=="string"||!/^[a-f0-9]{64}$/.test(result.hash))throw new Error("The generated image response was invalid.");
  const bytes=Uint8Array.from(atob(result.base64),character=>character.charCodeAt(0));if(hex(await crypto.subtle.digest("SHA-256",bytes))!==result.hash)throw new Error("Generated image integrity check failed.");
  setImage({url:`data:image/jpeg;base64,${result.base64}`,name:typeof result.downloadName==="string"?result.downloadName:"bitcoinwalk-sponsor-og.jpg"});setMessage("Your private 1200 × 630 preview is ready. Download it below. Public OG images update only after BitcoinWalk approval.");
 });}
 if(!sponsorPubkey)return null;
 return <section className={styles.artwork} aria-busy={busy}><p className={styles.artworkStep}>{needsUpload?"Step 1 of 3 · Logo":image?"Step 3 of 3 · Download":"Step 2 of 3 · Share image"}</p><h3>{needsUpload?"Add your sponsor logo":image?"Your share image is ready":"Your logo is saved"}</h3><p>Your logo goes in the “Powered by” area. Create a private preview here; BitcoinWalk reviews it before it appears publicly.</p>
  {needsUpload&&<>
  <details><summary>What logo format and size should I use?</summary><ul><li><strong>Ideal canvas:</strong> 1024 × 256 pixels in a 4:1 horizontal ratio.</li><li><strong>Minimum raster size:</strong> 640 × 160 pixels. The rendered sponsor slot is 400 × 100 pixels.</li><li><strong>Accepted:</strong> transparent PNG or WebP up to 5 MB, or outlined SVG up to 512 KB.</li><li><strong>Not accepted:</strong> JPEG, animated files, profile pictures, embedded images, scripts, external resources, live fonts or SVG text.</li><li><strong>Artwork:</strong> use a transparent background, sRGB colour, tight cropping and roughly 5% clear space around the mark. Convert all SVG text to paths and use a wide viewBox.</li><li><strong>Practical check:</strong> the logo must remain readable when reduced to 400 × 100. Square or vertical marks are allowed but will appear smaller.</li></ul><p>BitcoinWalk builds the final 1200 × 630 JPEG from the city hero, the BitcoinWalk symbol, “Powered by”, and your uploaded logo.</p></details>
  <label className={styles.logoPicker}>Choose logo file<input type="file" accept="image/png,image/webp,image/svg+xml" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]??null);}}/></label><button className={styles.action} type="button" disabled={busy||!file} onClick={()=>void upload()}>{busy?"Uploading…":"Sign and upload logo"}</button>
  {logoHash&&<button className={styles.artworkSecondary} type="button" disabled={busy} onClick={()=>{setChangingLogo(false);setFile(null);setMessage("Your saved logo is unchanged.");}}>Keep saved logo</button>}
  </>}
  {!needsUpload&&!image&&<button className={styles.action} type="button" disabled={busy} onClick={()=>void build()}>{busy?"Creating your image…":"Create share image"}</button>}
  {!needsUpload&&<button className={styles.artworkSecondary} type="button" disabled={busy} onClick={()=>{setChangingLogo(true);setMessage("Choose a replacement. Your saved logo stays unchanged until the upload succeeds.");}}>Change logo</button>}
  <p role="status" className={styles.artworkStatus}>{message}</p>{image&&!needsUpload&&<div className={styles.ogPreview}><img src={image.url} width="1200" height="630" alt={`Private BitcoinWalk ${order.cityName} sponsor OG preview`}/><a className={styles.action} href={image.url} download={image.name}>Download share image</a></div>}
 </section>;
}
