"use client";

import {nip19,type Event} from "nostr-tools";
import {useRef,useState,type FormEvent} from "react";
import {relayConfig} from "../lib/relay-config";
import {latestDashboardGrants} from "../nostr/dashboard-data";
import {queryAuthorizations} from "../nostr/city-records";
import {createCityDirectoryRoot,discoverExistingCityDirectoryRoot,normalizeDirectoryRelays,publishAndConfirmCityDirectoryRoot,verifySignedCityDirectoryTemplate} from "../nostr/city-directory";
import {publishVerifiedEvent} from "../nostr/relay";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {useDashboard,useDashboardAutoLoad} from "./dashboard-context";

type OwnedCity={id:string;name:string};
function pubkey(value:string,label:string){
  const raw=value.trim();
  if(/^[0-9a-f]{64}$/.test(raw))return raw;
  try{const decoded=nip19.decode(raw);if(decoded.type==="npub"&&typeof decoded.data==="string")return decoded.data;}catch{}
  throw new Error(`${label} must be an npub or lowercase 64-character public key.`);
}
function lines(value:FormDataEntryValue|null){return String(value??"").split(/[,\n]/).map(item=>item.trim()).filter(Boolean);}

export default function CityDirectoryOwner(){
  const dashboard=useDashboard(),lock=useRef(false);
  const [busy,setBusy]=useState(false),[cities,setCities]=useState<OwnedCity[]>([]),[cityId,setCityId]=useState(""),[message,setMessage]=useState("Load cities owned by the connected signer."),[published,setPublished]=useState<Event|null>(null);
  async function load(){
    if(lock.current)return;lock.current=true;setBusy(true);setPublished(null);
    try{
      if(!relayConfig.readRelays.length)throw new Error("No city permission read relay is configured.");
      const identity=await getBrowserExtensionPubkey(),grants=latestDashboardGrants(await queryAuthorizations(relayConfig.readRelays));
      if(await getBrowserExtensionPubkey()!==identity)throw new Error("Signer identity changed. Reconnect and try again.");
      const labels=new Map(dashboard.cities.map(city=>[city.id,city.name]));
      const owned=grants.filter(record=>record.grant.creatorPubkey===identity).map(record=>({id:record.grant.cityId,name:labels.get(record.grant.cityId)??record.grant.cityId})).sort((a,b)=>a.name.localeCompare(b.name));
      setCities(owned);setCityId(current=>owned.some(city=>city.id===current)?current:owned[0]?.id??"");
      setMessage(owned.length?"Choose an owned city and review the root carefully before asking your connected Nostr signer to sign.":"The connected signer is not the original owner of any returned city. Editors cannot establish a directory root.");
    }catch(error){setCities([]);setCityId("");setMessage(error instanceof Error?error.message:"Could not load owned cities.");}
    finally{lock.current=false;setBusy(false);}
  }
  useDashboardAutoLoad(load);
  async function submit(formEvent:FormEvent<HTMLFormElement>){
    formEvent.preventDefault();if(lock.current||!cityId||published)return;
    lock.current=true;setBusy(true);const form=new FormData(formEvent.currentTarget);
    try{
      const discovery=normalizeDirectoryRelays(relayConfig.directoryRelays);
      const identity=await getBrowserExtensionPubkey();
      const grants=latestDashboardGrants(await queryAuthorizations(relayConfig.readRelays));
      const current=grants.find(record=>record.grant.cityId===cityId);
      if(!current||current.grant.creatorPubkey!==identity)throw new Error("Current relay records do not confirm this signer as the original city owner. Nothing was signed.");
      setMessage("Checking each discovery relay for an existing root…");
      const existing=await discoverExistingCityDirectoryRoot(discovery,cityId,identity);
      const existingRoot=existing.root;
      if(existingRoot){
        if(existing.unavailableRelays.length){
          setPublished(existingRoot);setMessage(`Existing directory root ${existingRoot.id} was verified through ${existing.reachableRelays.length} transport${existing.reachableRelays.length===1?"":"s"}. ${existing.unavailableRelays.length} configured transport${existing.unavailableRelays.length===1?" is":"s are"} unavailable, so no replacement was created and no repair publication was attempted.`);
          return;
        }
        setMessage(`Recovering partial publication of exact root ${existingRoot.id}; no new event or signature will be created…`);
        await publishAndConfirmCityDirectoryRoot(existingRoot,discovery,(event,relays,required)=>publishVerifiedEvent(event,relays,required,authenticateWithBrowserExtension));
        setPublished(existingRoot);setMessage(`Existing directory root ${existingRoot.id} was recovered and read back from all ${discovery.length} discovery relays. Record this event ID as the city trust anchor.`);
        return;
      }
      const template=createCityDirectoryRoot({cityId,ownerPubkey:identity,operatorPubkeys:lines(form.get("operators")).map(value=>pubkey(value,"Each operator")),recoveryPubkey:pubkey(String(form.get("recovery")),"Recovery key"),primaryRelay:String(form.get("primary")),mirrorRelays:lines(form.get("mirrors"))});
      if(!window.confirm("Your connected Nostr signer will be asked to sign the permanent directory root shown in this form. The recovery key and city endpoints cannot be silently replaced. Continue?"))throw new Error("Signing cancelled; nothing was published.");
      setMessage("Approve the exact kind 30309 directory root in your connected Nostr signer…");
      const signed=verifySignedCityDirectoryTemplate(await signWithBrowserExtension(template),template,identity);
      if(await getBrowserExtensionPubkey()!==identity)throw new Error("Signer identity changed after signing. The event was not published.");
      setMessage(`Publishing ${signed.id} and independently reading it back from every discovery relay…`);
      await publishAndConfirmCityDirectoryRoot(signed,discovery,(event,relays,required)=>publishVerifiedEvent(event,relays,required,authenticateWithBrowserExtension));
      setPublished(signed);setMessage(`Directory root ${signed.id} is present on all ${discovery.length} configured discovery relays. Record this event ID as the city trust anchor.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Directory root publication failed.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <main><h1>Relay directory</h1><p>Publish a portable, owner-controlled directory for a paid city relay. Signing happens only in your connected NIP-07-compatible browser signer; BitcoinWalk never receives the private key.</p><p>This establishes technical owner control, not BitcoinWalk recognition or payment entitlement. Root publication is permanent; later changes require audited update, rotation or recovery events.</p><button type="button" disabled={busy} onClick={load}>{busy?"Working…":"Refresh owned cities"}</button><p role="status" aria-live="polite">{message}</p>{cities.length>0&&<form onSubmit={submit}><fieldset disabled={busy||!!published}><legend>Permanent directory root</legend><label>Owned city <select value={cityId} onChange={event=>setCityId(event.target.value)}>{cities.map(city=><option key={city.id} value={city.id}>{city.name} — {city.id}</option>)}</select></label><label>Primary public city relay <input name="primary" type="url" required placeholder="wss://city.example/"/></label><label>Public mirror relays <textarea name="mirrors" placeholder="wss://mirror.example/&#10;One root WSS URL per line"/></label><p>These are city-data endpoints. They are different from the two or more directory discovery relays configured by BitcoinWalk.</p><label>Offline recovery npub <input name="recovery" required placeholder="npub1…" autoComplete="off" spellCheck={false}/></label><p>Use a separate key stored offline. It must not be this owner key or an operator key.</p><label>Optional operator npubs <textarea name="operators" placeholder="One npub per line" autoComplete="off" spellCheck={false}/></label><p>Operators can update endpoints only. They cannot change the owner, operators or recovery key.</p><button type="submit">Review and sign directory root</button></fieldset></form>}{published&&<section><h2>Trust anchor created</h2><p>Event ID: <code>{published.id}</code></p><p>Owner: <code>{published.pubkey}</code></p></section>}</main>;
}
