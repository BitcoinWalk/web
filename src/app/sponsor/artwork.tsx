"use client";

import {useEffect,useState,useRef} from "react";
import Image from "next/image";
import {mediaRequestTemplate} from "../../domain/media-request";
import {signForOrganizer} from "../../nostr/organizer-identity";
import type {SponsorOrder} from "../../payments/sponsor-types";
import styles from "./sponsor.module.css";

function base64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);}
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");}

export default function PaidSponsorArtwork({order,token,onUploaded,onSponsorMore}:{order:SponsorOrder;token:string;onUploaded:(hash:string)=>void;onSponsorMore:()=>void}){
 type Preview={url:string;name:string;href:string;title:string;description:string;siteName:string};
 const [file,setFile]=useState<File|null>(null),[logoHash,setLogoHash]=useState(order.logoHash),[image,setImage]=useState<Preview|null>(null),[message,setMessage]=useState(order.logoHash?"Creating your sponsored link preview…":"Choose your logo after reading the format guide."),[busy,setBusy]=useState(false),[previewState,setPreviewState]=useState<"idle"|"loading"|"ready"|"error">(order.logoHash?"loading":"idle"),lock=useRef(false),attempted=useRef<string|null>(null);
 const [changingLogo,setChangingLogo]=useState(false);
 const sponsorPubkey=order.pubkey,needsUpload=!logoHash||changingLogo;
 async function run(work:()=>Promise<void>){if(lock.current)return false;lock.current=true;setBusy(true);try{await work();return true;}catch(error){setMessage(error instanceof Error?error.message:"Artwork request failed.");return false;}finally{lock.current=false;setBusy(false);}}
 async function installPreview(result:{mime?:unknown;width?:unknown;height?:unknown;base64?:unknown;hash?:unknown;downloadName?:unknown;preview?:{url?:unknown;title?:unknown;description?:unknown;siteName?:unknown}}){
  if(result.mime!=="image/jpeg"||result.width!==1200||result.height!==630||typeof result.base64!=="string"||typeof result.hash!=="string"||!/^[a-f0-9]{64}$/.test(result.hash))throw new Error("The generated image response was invalid.");
  const bytes=Uint8Array.from(atob(result.base64),character=>character.charCodeAt(0));if(hex(await crypto.subtle.digest("SHA-256",bytes))!==result.hash)throw new Error("Generated image integrity check failed.");
  const preview=result.preview;if(!preview||typeof preview.url!=="string"||typeof preview.title!=="string"||typeof preview.description!=="string"||preview.siteName!=="bitcoinwalk.org")throw new Error("The sponsored link metadata could not be verified.");
  setImage({url:`data:image/jpeg;base64,${result.base64}`,name:typeof result.downloadName==="string"?result.downloadName:"bitcoinwalk-sponsor-og.jpg",href:preview.url,title:preview.title,description:preview.description,siteName:preview.siteName});setPreviewState("ready");
 }
 async function upload(){if(!file||!sponsorPubkey)return;await run(async()=>{
  if(!["image/png","image/webp","image/svg+xml"].includes(file.type)||file.size===0||file.size>5*1024*1024)throw new Error("Choose a PNG, WebP or outlined SVG within the stated size limit. JPEG is not accepted.");
  if(file.type==="image/svg+xml"&&file.size>512*1024)throw new Error("SVG logos must be 512 KB or smaller.");
  const bytes=new Uint8Array(await file.arrayBuffer()),sha256=hex(await crypto.subtle.digest("SHA-256",bytes)),template=mediaRequestTemplate({action:"upload-paid-sponsor-logo",orderId:order.id,cityId:order.cityId,sponsorPubkey,sha256,mime:file.type as "image/png"|"image/webp"|"image/svg+xml"});
  setMessage("Sign the private logo upload with the sponsor identity. This does not publish or approve the artwork.");
  const event=await signForOrganizer(template,sponsorPubkey),response=await fetch("/api/sponsors/logo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,token,base64:base64(bytes)})}),result=await response.json();
  if(!response.ok)throw new Error(result.error||"Logo upload failed.");
  if(!/^[a-f0-9]{64}$/.test(result.hash))throw new Error("The stored logo response was invalid.");
  attempted.current=result.linkPreview?result.hash:null;setLogoHash(result.hash);setFile(null);setChangingLogo(false);setImage(null);onUploaded(result.hash);if(result.linkPreview){try{await installPreview(result.linkPreview);setMessage("Your private link preview is ready. BitcoinWalk approval will make it public.");}catch(error){setPreviewState("error");throw error;}}else{setPreviewState("loading");setMessage("Logo saved. Creating your sponsored link preview…");}
 });}
 async function build(hash=logoHash){if(!hash||!sponsorPubkey)return;setPreviewState("loading");const ok=await run(async()=>{
  const template=mediaRequestTemplate({action:"generate-paid-sponsor-composite",orderId:order.id,cityId:order.cityId,sponsorPubkey,hash}),event=await signForOrganizer(template,sponsorPubkey),response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,token})}),result=await response.json();
  if(!response.ok)throw new Error(result.error||"Could not build the OG image.");await installPreview(result);setMessage("Your private link preview is ready. BitcoinWalk approval will make it public.");
 });if(!ok)setPreviewState("error");}
 useEffect(()=>{if(!logoHash||changingLogo||image||attempted.current===logoHash)return;attempted.current=logoHash;void build(logoHash);},[logoHash,changingLogo,image]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!sponsorPubkey)return null;
 return <section className={styles.artwork} aria-busy={busy}>
  {needsUpload?<><h3>Add your sponsor logo</h3><p>Your logo goes in the “Powered by” area. BitcoinWalk reviews it before it appears publicly.</p></>:<div className={styles.sponsorComplete}>
   <p className={styles.artworkStep}>Payment confirmed · Logo saved</p>
   <h3>{order.needsReview?"Your sponsorship needs a date review":"You’re all set — thank you!"}</h3>
   <p>{order.needsReview?"Please contact BitcoinWalk with your order number to confirm the selected dates.":"There’s nothing else you need to do. BitcoinWalk will review your logo before it appears publicly."}</p>
   <button className={styles.action} type="button" disabled={busy} onClick={onSponsorMore}>Sponsor more walks</button>
  </div>}
  {needsUpload&&<>
  <details><summary>What logo format and size should I use?</summary><ul><li><strong>Ideal canvas:</strong> 1024 × 256 pixels in a 4:1 horizontal ratio.</li><li><strong>Minimum raster size:</strong> 640 × 160 pixels. The rendered sponsor slot is 400 × 100 pixels.</li><li><strong>Accepted:</strong> transparent PNG or WebP up to 5 MB, or outlined SVG up to 512 KB.</li><li><strong>Not accepted:</strong> JPEG, animated files, profile pictures, embedded images, scripts, external resources, live fonts or SVG text.</li><li><strong>Artwork:</strong> use a transparent background, sRGB colour, tight cropping and roughly 5% clear space around the mark. Convert all SVG text to paths and use a wide viewBox.</li><li><strong>Practical check:</strong> the logo must remain readable when reduced to 400 × 100. Square or vertical marks are allowed but will appear smaller.</li></ul><p>BitcoinWalk builds the final 1200 × 630 JPEG from the city hero, the BitcoinWalk symbol, “Powered by”, and your uploaded logo.</p></details>
  <label className={styles.logoPicker}>Choose logo file<input type="file" accept="image/png,image/webp,image/svg+xml" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]??null);}}/></label><button className={styles.action} type="button" disabled={busy||!file} onClick={()=>void upload()}>{busy?"Uploading…":"Sign and upload logo"}</button>
  {logoHash&&<button className={styles.artworkSecondary} type="button" disabled={busy} onClick={()=>{setChangingLogo(false);setFile(null);setMessage("Your saved logo is unchanged.");}}>Keep saved logo</button>}
  </>}
  {!needsUpload&&previewState==="loading"&&<div className={styles.previewLoading} role="status"><span aria-hidden="true"/><div><strong>Creating your sponsored link preview…</strong><small>Building the OG image and checking its title, description and URL.</small></div></div>}
  {!needsUpload&&previewState==="error"&&<button className={styles.artworkSecondary} type="button" disabled={busy} onClick={()=>{attempted.current=null;void build();}}>Retry link preview</button>}
  {!needsUpload&&<button className={styles.artworkSecondary} type="button" disabled={busy} onClick={()=>{setChangingLogo(true);setMessage("Choose a replacement. Your saved logo stays unchanged until the upload succeeds.");}}>Change logo</button>}
  <p role="status" className={styles.artworkStatus}>{message}</p>{image&&!needsUpload&&<section className={styles.linkPreview} aria-labelledby="sponsored-link-preview"><div className={styles.previewHeading}><span aria-hidden="true">✓</span><div><h4 id="sponsored-link-preview">This is what this BitcoinWalk preview will look like</h4><p>This is how the first sponsored walk will look when shared. It becomes public after BitcoinWalk approves the logo.</p></div></div><div className={styles.phonePreview}><div className={styles.whatsappBubble}><Image unoptimized src={image.url} width={1200} height={630} alt={`Private BitcoinWalk ${order.cityName} sponsored link preview`}/><div className={styles.previewCopy}><strong>{image.title}</strong><span>{image.description}</span><small>↗&nbsp; {image.siteName}</small></div></div></div><div className={styles.previewActions}><a href={image.href} target="_blank" rel="noreferrer">Open walk page</a><a href={image.url} download={image.name}>Download image · JPG</a></div></section>}
 </section>;
}
