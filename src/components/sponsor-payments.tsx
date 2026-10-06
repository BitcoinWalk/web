"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import {nip19} from "nostr-tools";
import {useDashboardAutoLoad} from "./dashboard-context";
import {getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {sponsorRequest} from "../payments/sponsor-auth";
import type {SponsorOrder} from "../payments/sponsor-types";
import NostrUser from "./nostr-user";
import {latestSponsorships,querySponsorships} from "../nostr/sponsorships";
import {relayConfig} from "../lib/relay-config";
import styles from "./organizer-directory.module.css";
export default function SponsorPayments(){
 const [orders,setOrders]=useState<SponsorOrder[]>([]),[assigned,setAssigned]=useState<string[]>([]),[query,setQuery]=useState(""),[message,setMessage]=useState("Connect the super-admin to view sponsor payments."),lock=useRef(false);
 useDashboardAutoLoad(load);
 async function load(){if(lock.current)return;lock.current=true;try{const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor))throw new Error("Super-admin identity required.");const event=await signWithBrowserExtension(sponsorRequest("list",window.location.origin));const response=await fetch("/api/sponsorships",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"list",event}),cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error);if(await getBrowserExtensionPubkey()!==actor)throw new Error("Identity changed.");const assignments=latestSponsorships(await querySponsorships(relayConfig.readRelays));if(await getBrowserExtensionPubkey()!==actor)throw new Error("Identity changed.");setAssigned([...new Set(assignments.flatMap(row=>row.sponsorship.mode==="sponsor"&&row.sponsorship.sponsorPubkey?[row.sponsorship.sponsorPubkey]:[]))]);setOrders(data.orders);setMessage(`${data.orders.length} sponsorship payments.`);}catch(e){setOrders([]);setAssigned([]);setMessage(e instanceof Error?e.message:"Payments unavailable.");}finally{lock.current=false;}}
 const filtered=orders.filter(o=>[o.cityName,o.pubkey??"",o.pubkey?nip19.npubEncode(o.pubkey):"",o.paymentHash??"",o.id,o.status].join(" ").toLowerCase().includes(query.toLowerCase())),identities=[...new Set([...filtered.map(o=>o.pubkey??`unclaimed:${o.id}`),...assigned.filter(pubkey=>!orders.some(o=>o.pubkey===pubkey)&&(!query||nip19.npubEncode(pubkey).includes(query)||pubkey.includes(query)))])];
 return <section><h1>Sponsors and payments</h1><p><Link href="/admin/sponsors">Manage sponsor assignments and artwork →</Link></p><label>Search city, npub, order or payment hash<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><button onClick={()=>void load()}>Refresh payments</button><p role="status">{message}</p><div className={styles.grid}>{identities.map(key=>{const rows=filtered.filter(o=>(o.pubkey??`unclaimed:${o.id}`)===key),pubkey=rows[0]?.pubkey??(key.startsWith("unclaimed:")?null:key);return <article key={key}>{pubkey?<NostrUser pubkey={pubkey}/>:<h2>Awaiting sponsor identity</h2>}{!rows.length&&<p>Existing sponsor · No payment recorded through this checkout.</p>}{rows.map(order=><section key={order.id}><h3>{order.cityName} · {order.count} walks</h3><p><strong>{order.status}</strong> · {(order.amountMsat/1000).toLocaleString()} sats{order.needsReview?" · Needs review":""}</p><p>Created {new Date(order.createdAt*1000).toLocaleString()}{order.settledAt?` · Paid ${new Date(order.settledAt*1000).toLocaleString()}`:""}</p><ul>{order.walks.map(w=><li key={w.id}>{w.label}</li>)}</ul><p style={{overflowWrap:"anywhere"}}>Payment hash: <code>{order.paymentHash??"Not issued"}</code></p><small>Order {order.id}</small></section>)}</article>;})}</div></section>;
}
