"use client";
import {useEffect,useState} from "react";
import {nip19} from "nostr-tools";
import {cityOwnerPubkey} from "../domain/city";
import {relayConfig} from "../lib/relay-config";
import {assertCityEditorRequestSignature,createCityEditorRequest,editorRequestPublicKey} from "../nostr/city-editor-requests";
import {queryCityAuthorization,type AuthorizationRecord} from "../nostr/city-records";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";
import {publishVerifiedEvent} from "../nostr/relay";
import EditorIdentity from "./editor-identity";
import {watchPublicProfiles,type PublicProfile} from "../nostr/profiles";

export default function CityEditorsPanel({record,identity,cityName}:{record:AuthorizationRecord;identity:string;cityName:string}){
  const [busy,setBusy]=useState(false),[npub,setNpub]=useState(""),[message,setMessage]=useState(""),[requested,setRequested]=useState<Record<string,"add"|"remove">>({}),[profiles,setProfiles]=useState<Record<string,PublicProfile>>({});
  const owner=cityOwnerPubkey(record.grant),canManage=identity===owner,keys=[...new Set(record.grant.editorPubkeys)].sort(),profileKeys=keys.join(",");
  useEffect(()=>watchPublicProfiles(profileKeys?profileKeys.split(","):[],(key,profile)=>setProfiles(current=>({...current,[key]:profile}))),[profileKeys]);
  async function request(action:"add"|"remove",key?:string){
    if(busy||!canManage)return;setBusy(true);setMessage("Checking the current editor list…");
    try{
      if(!relayConfig.writeRelays.length)throw new Error("No write relay configured.");
      const actor=await getBrowserExtensionPubkey();if(actor!==owner)throw new Error("Connect the current city owner account.");
      const target=key??editorRequestPublicKey(npub),current=await queryCityAuthorization(relayConfig.writeRelays,record.grant.cityId);
      if(!current||current.event.id!==record.event.id)throw new Error("The editor list changed. Refresh My cities before requesting another change.");
      if(!window.confirm(`${action==="add"?"Request editor access for":"Request removal of"}\n${nip19.npubEncode(target)}\nCity: ${cityName}\n\nBitcoinWalk will review and sign the final permission change.`)){setMessage("Cancelled. Nothing was signed.");return;}
      setMessage("Approve the city editor request in your signer…");
      const template=createCityEditorRequest(current,actor,action,target),signed=await signWithBrowserExtension(template);
      assertCityEditorRequestSignature(signed,template,actor);
      if(await getBrowserExtensionPubkey()!==actor)throw new Error("Signer changed. Nothing was published.");
      await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      setRequested(value=>({...value,[target]:action}));setNpub("");setMessage(`Request sent. BitcoinWalk must approve it before ${nip19.npubEncode(target)} ${action==="add"?"can edit this city":"loses editor access"}.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not submit the editor request.");}
    finally{setBusy(false);}
  }
  return <section aria-labelledby="city-editors-heading">
    <h3 id="city-editors-heading">City editors</h3>
    <p>Editors use their own Nostr accounts to help manage this city. Never share the city nsec.</p>
    <ul>{keys.map(key=><li key={key}><EditorIdentity pubkey={key} profile={profiles[key]}/>{key===owner?" — Owner":requested[key]?` — ${requested[key]==="add"?"addition":"removal"} awaiting BitcoinWalk approval`:canManage?<button type="button" disabled={busy} onClick={()=>void request("remove",key)}>Remove editor</button>:null}</li>)}</ul>
    {canManage?<form onSubmit={event=>{event.preventDefault();void request("add");}}><label>New editor npub<input value={npub} onChange={event=>setNpub(event.target.value)} placeholder="npub1…" autoComplete="off" spellCheck={false} disabled={busy} required/></label><button type="submit" disabled={busy}>{busy?"Submitting…":"Request editor access"}</button><p>The request is signed by the city owner. BitcoinWalk reviews and signs the final permission change.</p></form>:<p>Only the current city owner can request editor changes.</p>}
    {message&&<p role="status" aria-live="polite">{message}</p>}
  </section>;
}
