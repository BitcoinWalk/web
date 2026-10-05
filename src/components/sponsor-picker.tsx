"use client";
import {useEffect,useMemo,useState} from "react";
import {nip19} from "nostr-tools";
import CityFinder from "./city-finder";
import {watchPublicProfiles} from "../nostr/profiles";
import {sponsorCatalog} from "../domain/sponsor-catalog";
import type {SponsorshipRevision} from "../nostr/sponsorships";
export default function SponsorPicker({rows,value,disabled,onChange}:{rows:SponsorshipRevision[];value:string;disabled:boolean;onChange:(entry:ReturnType<typeof sponsorCatalog>[number]|null)=>void}){
 const entries=useMemo(()=>sponsorCatalog(rows),[rows]),[names,setNames]=useState<Record<string,string>>({});
 const keys=entries.map(row=>row.pubkey).sort().join(",");
 useEffect(()=>{if(!keys)return;return watchPublicProfiles(keys.split(","),(key,profile)=>{if(profile.name)setNames(old=>({...old,[key]:profile.name!}));});},[keys]);
 return <CityFinder label="Sponsor Name" placeholder="Search existing sponsors by name, npub or website…" disabled={disabled} value={value} onChange={id=>onChange(entries.find(entry=>entry.pubkey===id)??null)} items={entries.map(entry=>({id:entry.pubkey,name:names[entry.pubkey]??(entry.website.replace(/^https:\/\//,"").replace(/\/$/,"")||nip19.npubEncode(entry.pubkey)),meta:nip19.npubEncode(entry.pubkey).slice(0,16)+"…",keywords:[entry.pubkey,nip19.npubEncode(entry.pubkey),entry.website]}))}/>;
}
