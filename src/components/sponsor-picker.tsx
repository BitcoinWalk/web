"use client";
import {useEffect,useMemo,useState} from "react";
import {nip19} from "nostr-tools";
import SearchablePicker from "./searchable-picker";
import {watchPublicProfiles} from "../nostr/profiles";
import {sponsorCatalogueEntries,type SponsorCatalogueRevision} from "../nostr/sponsor-catalogue";
export default function SponsorPicker({rows,value,disabled,onChange}:{rows:SponsorCatalogueRevision[];value:string;disabled:boolean;onChange:(entry:ReturnType<typeof sponsorCatalogueEntries>[number]|null)=>void}){
 const entries=useMemo(()=>sponsorCatalogueEntries(rows),[rows]),[names,setNames]=useState<Record<string,string>>({});
 const keys=entries.map(row=>row.pubkey).sort().join(",");
 useEffect(()=>{if(!keys)return;return watchPublicProfiles(keys.split(","),(key,profile)=>{if(profile.name)setNames(old=>({...old,[key]:profile.name!}));});},[keys]);
 return <SearchablePicker label="Sponsor" placeholder="Search reusable sponsors by name, npub or website…" disabled={disabled} value={value} onChange={id=>onChange(entries.find(entry=>entry.pubkey===id)??null)} items={entries.map(entry=>({id:entry.pubkey,name:names[entry.pubkey]??entry.displayName,meta:nip19.npubEncode(entry.pubkey).slice(0,16)+"…",keywords:[entry.pubkey,nip19.npubEncode(entry.pubkey),entry.website,entry.displayName]}))} listLabel="Sponsors" singular="sponsor" plural="sponsors" clearLabel="Clear selected sponsor" emptyMessage="No matching approved catalogue sponsor. Import an existing sponsor first."/>;
}
