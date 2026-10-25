"use client";
import {useEffect,useRef,useState} from "react";
import {nip19} from "nostr-tools";
import {useDashboard} from "./dashboard-context";
import {AdminButton,AdminFeedback,AdminStatusBadge} from "./admin-ui";
import {latestSponsorships,sponsorshipKey,type SponsorshipRevision} from "../nostr/sponsorships";
import {createSponsorCatalogueRevision,latestSponsorCatalogueRevisions,sponsorCatalogueEntries,type SponsorCatalogueRevision} from "../nostr/sponsor-catalogue";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";
import {getBrowserExtensionPubkey,signWithBrowserExtension,authenticateWithBrowserExtension} from "../nostr/signer";
import {isSuperAdmin} from "../nostr/authority";
import {assertExactSigned} from "../nostr/moderation";
import {publishVerifiedEvent} from "../nostr/relay";
import {relayConfig} from "../lib/relay-config";
import styles from "../app/admin/sponsors/sponsors.module.css";

export default function SponsorCatalogueAdmin({assignments,catalogue,onPublished}:{assignments:SponsorshipRevision[];catalogue:SponsorCatalogueRevision[];onPublished:()=>Promise<void>}){
 const dashboard=useDashboard(),lock=useRef(false),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({}),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 const entries=sponsorCatalogueEntries(catalogue),withdrawnKeys=new Set(latestSponsorCatalogueRevisions(catalogue).filter(row=>row.record.recordType==="claim"&&row.record.state==="withdrawn").map(row=>row.record.sponsorPubkey)),entryKeys=new Set([...entries.map(row=>row.pubkey),...withdrawnKeys]);
 const candidates=latestSponsorships(assignments).filter(row=>row.sponsorship.mode==="sponsor"&&row.sponsorship.sponsorPubkey&&row.sponsorship.logoHash&&!entryKeys.has(row.sponsorship.sponsorPubkey)).map(row=>({row,pubkey:row.sponsorship.sponsorPubkey!,logoHash:row.sponsorship.logoHash!,website:row.sponsorship.website??"",cityId:row.sponsorship.scope.cityId,scopeKey:sponsorshipKey(row.sponsorship.scope)})).filter((row,index,all)=>all.findIndex(item=>item.pubkey===row.pubkey)===index);
 const keys=[...new Set([...entries.map(row=>row.pubkey),...candidates.map(row=>row.pubkey)])].sort().join(",");
 useEffect(()=>{if(!keys)return;return watchPublicProfiles(keys.split(","),(key,profile)=>setProfiles(old=>({...old,[key]:profile})));},[keys]);
 function label(pubkey:string,website:string){const profile=profiles[pubkey],fallback=website?new URL(website).hostname.replace(/^www\./,""):nip19.npubEncode(pubkey).slice(0,18)+"…";return (profile?.name??fallback).slice(0,80);}
 async function importCandidate(candidate:(typeof candidates)[number]){
  if(lock.current)return;lock.current=true;setBusy(candidate.pubkey);setMessage("");
  try{const actor=await getBrowserExtensionPubkey();if(!isSuperAdmin(actor)||actor!==dashboard.pubkey)throw new Error("Connect the BitcoinWalk super-admin identity.");const template=createSponsorCatalogueRevision({version:1,recordType:"approval",sponsorPubkey:candidate.pubkey,status:"approved",displayName:label(candidate.pubkey,candidate.website),...(candidate.website?{website:candidate.website}:{}),logoHash:candidate.logoHash,source:"legacy-assignment",sourceEventId:candidate.row.event.id,sourceCityId:candidate.cityId,sourceScopeKey:candidate.scopeKey});const event=await signWithBrowserExtension(template);assertExactSigned(event,template);if(event.pubkey!==actor)throw new Error("Signer changed.");const result=await publishVerifiedEvent(event,relayConfig.writeRelays,1,authenticateWithBrowserExtension);setMessage(`${label(candidate.pubkey,candidate.website)} added to the reusable sponsor catalogue on ${result.accepted.length} relay(s). The existing sponsorship was not changed.`);await onPublished();}catch(error){setMessage(error instanceof Error?error.message:"The sponsor could not be added to the catalogue.");}finally{lock.current=false;setBusy("");}
 }
 return <section className={styles.catalogue} aria-labelledby="sponsor-catalogue-heading"><header><div><h2 id="sponsor-catalogue-heading">Reusable sponsor catalogue</h2><p>Approved identities and logos can be reused without another upload. Importing an existing sponsor does not change its live placement.</p></div><AdminStatusBadge tone={candidates.length?"warning":"success"}>{entries.length} ready · {candidates.length} to import</AdminStatusBadge></header>{message&&<AdminFeedback tone={message.includes("added")?"success":"error"}>{message}</AdminFeedback>}<div className={styles.catalogueGrid}>{entries.map(entry=><article key={entry.pubkey}><div><h3>{entry.displayName}</h3><p>{entry.website||nip19.npubEncode(entry.pubkey)}</p></div><AdminStatusBadge tone="success">Approved</AdminStatusBadge><small>Reusable approved logo · {entry.source==="legacy-assignment"?"migrated from an existing assignment":"sponsor claim"}</small></article>)}{candidates.map(candidate=><article key={candidate.pubkey}><div><h3>{label(candidate.pubkey,candidate.website)}</h3><p>{candidate.website||nip19.npubEncode(candidate.pubkey)}</p></div><AdminStatusBadge tone="warning">Existing sponsor</AdminStatusBadge><small>Its npub and approved logo are already present in a signed assignment.</small><AdminButton variant="primary" disabled={Boolean(busy)} onClick={()=>void importCandidate(candidate)}>{busy===candidate.pubkey?"Waiting for signature…":"Add to reusable catalogue"}</AdminButton></article>)}</div>{!entries.length&&!candidates.length&&<p className={styles.empty}>No approved sponsor identity with an approved logo is available yet.</p>}</section>;
}
