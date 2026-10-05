"use client";
/* eslint-disable @next/next/no-img-element -- Private integrity-checked image data. */
import {useState} from "react";
export default function SponsorLogoPreview({hash}:{cityId:string;sponsorPubkey:string;hash:string}){
 const [failed,setFailed]=useState(false),src=`/api/sponsors/logo/files/${hash}`;
 return <div><p>Saved sponsor logo selected. Saving this assignment will include it.</p>{failed?<p role="alert">The approved logo preview is temporarily unavailable. Refresh the sponsor list and retry.</p>:<div style={{background:"#888",padding:16}}><img key={hash} alt="Selected sponsor logo" src={src} onError={()=>setFailed(true)} style={{maxWidth:320,maxHeight:160}}/></div>}</div>;
}
