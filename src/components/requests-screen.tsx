"use client";

import SubmissionApprovals from "../app/admin/_approvals-screen";
import CityBrandReview from "./city-brand-review";
import {useDashboard} from "./dashboard-context";
import {useEffect,useState} from "react";
import Link from "next/link";
import {queryDirectoryRecords,pendingCityRevisions} from "../nostr/city-records";
import {needsChangesCities} from "../nostr/moderation";
import {relayConfig} from "../lib/relay-config";

function RequestQueuesSummary(){
 const {role}=useDashboard(),[counts,setCounts]=useState<{action:number;awaiting:number}|null>(null);
 useEffect(()=>{if(role!=="super-admin")return;let active=true;void queryDirectoryRecords(relayConfig.readRelays).then(({revisions,approvals})=>{if(active)setCounts({action:pendingCityRevisions(revisions,approvals).length,awaiting:needsChangesCities(revisions,approvals).length});}).catch(()=>{if(active)setCounts(null);});return()=>{active=false;};},[role]);
 if(role!=="super-admin")return null;
 return <section aria-labelledby="request-queues-heading"><h2 id="request-queues-heading">City request queues</h2><p>This page only shows work that is waiting on someone. The complete operational inventory and manual city status controls are in <Link href="/admin/cities">Cities</Link>.</p><div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}><strong style={{border:"1px solid #d87800",borderRadius:"999px",padding:"0.3rem 0.65rem",color:"#7c4400",background:"#fff6e8"}}>Action required ({counts?.action??"…"})</strong><strong style={{border:"1px solid #92733d",borderRadius:"999px",padding:"0.3rem 0.65rem",color:"#6c4c17",background:"#faf4e8"}}>Awaits change ({counts?.awaiting??"…"})</strong></div><p><small><strong>Action required</strong> means the super-admin owns the next step. <strong>Awaits change</strong> means a host or external provider must act first.</small></p></section>;
}

export default function RequestsScreen(){
 const {pubkey,role}=useDashboard();
 return <main><h1>Requests</h1><RequestQueuesSummary/>{role==="super-admin"&&<CityBrandReview actor={pubkey}/>}<SubmissionApprovals/></main>;
}
