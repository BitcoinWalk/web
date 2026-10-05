"use client";
/* eslint-disable @next/next/no-img-element -- Integrity-checked private data URL previews. */
import {useEffect,useMemo,useRef,useState} from "react";
import {nip19} from "nostr-tools";
import {useDashboard} from "./dashboard-context";
import CityFinder,{type CityFinderItem} from "./city-finder";
import {isSuperAdmin} from "../nostr/authority";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {assertExactSigned} from "../nostr/moderation";
import {mediaRequestTemplate,type MediaRequest} from "../domain/media-request";
import {latestSponsorships,type SponsorshipRevision} from "../nostr/sponsorships";
import {watchPublicProfiles} from "../nostr/profiles";

type Asset={cityId:string;sponsorPubkey:string;hash:string;uploadedAt?:number};
export default function SponsorAssetLibrary({cities,assignments}:{cities:CityFinderItem[];assignments:SponsorshipRevision[]}){
 const dashboard=useDashboard(),lock=useRef(false);
 const [uploads,setUploads]=useState<Asset[]>([]),[city,setCity]=useState(""),[query,setQuery]=useState(""),[names,setNames]=useState<Record<string,string>>({}),[previews,setPreviews]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState("Approved assignments appear below. Load uploaded assets to include pending artwork and cleared sponsors.");
 const approved=useMemo(()=>latestSponsorships(assignments).filter(row=>row.sponsorship.mode==="sponsor"&&row.sponsorship.logoHash).map(row=>({cityId:row.sponsorship.scope.cityId,sponsorPubkey:row.sponsorship.sponsorPubkey!,hash:row.sponsorship.logoHash!,website:row.sponsorship.website??""})),[assignments]);
 const assets=useMemo(()=>[...new Map([...uploads,...approved].map(row=>[`${row.cityId}:${row.sponsorPubkey}:${row.hash}`,row])).values()],[uploads,approved]);
 const keys=useMemo(()=>[...new Set(assets.map(row=>row.sponsorPubkey))].sort().join(","),[assets]);
 useEffect(()=>{if(!keys)return;return watchPublicProfiles(keys.split(","),(key,profile)=>{if(profile.name)setNames(previous=>({...previous,[key]:profile.name!}));});},[keys]);
 async function request(command:MediaRequest){
  const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor)||actor!==dashboard.pubkey)throw new Error("Connect the super-admin identity.");
  const template=mediaRequestTemplate(command),event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==actor)throw new Error("Signer changed.");
  const response=await fetch("/api/sponsors/assets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event})}),body=await response.json();if(!response.ok)throw new Error(body.error||"Could not load assets.");return body;
 }
 async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);try{await action();}catch(error){setMessage(error instanceof Error?error.message:"Could not load assets.");}finally{lock.current=false;setBusy(false);}}
 async function preview(asset:Asset){const body=await request({action:"preview-sponsor-asset",cityId:asset.cityId,sponsorPubkey:asset.sponsorPubkey,hash:asset.hash});if(typeof body.base64!=="string")throw new Error("Invalid preview.");const bytes=Uint8Array.from(atob(body.base64),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");if(hash!==asset.hash||body.hash!==hash)throw new Error("Asset integrity check failed.");setPreviews(previous=>({...previous,[asset.hash]:body.base64}));setMessage("Private preview loaded. No approval or assignment was changed.");}
 const visible=assets.filter(asset=>(!city||asset.cityId===city)&&[asset.sponsorPubkey,nip19.npubEncode(asset.sponsorPubkey),names[asset.sponsorPubkey]??"",...approved.filter(row=>row.sponsorPubkey===asset.sponsorPubkey).map(row=>row.website)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 return <section id="sponsor-assets"><h2>Sponsor asset library</h2><p>Search uploaded and currently approved logos. Previewing is read-only; approval still requires a separate signature. A logo approved for one assignment is not automatically approved for another.</p><button disabled={busy} onClick={()=>void run(async()=>{const body=await request({action:"list-sponsor-assets"});setUploads(body.assets);setMessage("Uploaded assets loaded. Select Preview to view artwork privately.");})}>Load / refresh uploaded assets</button><CityFinder label="Filter assets by city" items={cities} value={city} onChange={setCity}/><label>Search sponsor<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Sponsor name, npub, public key or website"/></label><p role="status">{message}</p><p>{visible.length} asset(s)</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:16}}>{visible.map(asset=>{const signed=approved.some(row=>row.cityId===asset.cityId&&row.sponsorPubkey===asset.sponsorPubkey&&row.hash===asset.hash);return <article key={`${asset.cityId}:${asset.sponsorPubkey}:${asset.hash}`} style={{border:"1px solid #aaa",padding:16,overflowWrap:"anywhere"}}><h3>{cities.find(item=>item.id===asset.cityId)?.name??asset.cityId}</h3><p>{names[asset.sponsorPubkey]??"Sponsor"}</p><small>{nip19.npubEncode(asset.sponsorPubkey)}</small><p>{signed?"Approved in a current assignment":"Uploaded — not referenced by a current approval"}</p>{previews[asset.hash]?<div style={{background:"#888",padding:16}}><img src={`data:image/png;base64,${previews[asset.hash]}`} alt={`Sponsor logo for ${cities.find(item=>item.id===asset.cityId)?.name??asset.cityId}`} style={{maxWidth:"100%",maxHeight:180}}/></div>:<button disabled={busy} onClick={()=>void run(()=>preview(asset))}>Preview logo</button>}<details><summary>Asset hash</summary>{asset.hash}</details></article>;})}</div></section>;
}
