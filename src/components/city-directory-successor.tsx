"use client";

import {nip19} from "nostr-tools";
import {useRef,useState,type FormEvent} from "react";
import {relayConfig} from "../lib/relay-config";
import {
  createCityDirectoryOperatorUpdate,
  createCityDirectoryOwnerUpdate,
  createCityDirectoryRecovery,
  createCityDirectoryRotation,
  discoverCityDirectoryChainForSigning,
  publishAndConfirmCityDirectoryRoot,
  verifySignedCityDirectorySuccessor,
  type CityDirectoryAnchor,
  type CityDirectoryState,
} from "../nostr/city-directory";
import {publishVerifiedEvent} from "../nostr/relay";
import {authenticateWithBrowserExtension,getBrowserExtensionPubkey,signWithBrowserExtension} from "../nostr/signer";

type DirectoryAction="owner-update"|"operator-update"|"rotate"|"recover";
type LoadedDirectory={anchor:CityDirectoryAnchor;state:CityDirectoryState;identity:string};

function publicKey(value:string,label:string){
  const raw=value.trim();
  if(/^[0-9a-f]{64}$/.test(raw))return raw;
  try{const decoded=nip19.decode(raw);if(decoded.type==="npub"&&typeof decoded.data==="string")return decoded.data;}catch{}
  throw new Error(`${label} must be an npub or lowercase 64-character public key.`);
}
function eventId(value:string){const raw=value.trim();if(!/^[0-9a-f]{64}$/.test(raw))throw new Error("Trust anchor event ID must be lowercase 64-character hex.");return raw;}
function lines(value:FormDataEntryValue|null){return String(value??"").split(/[,\n]/).map(item=>item.trim()).filter(Boolean);}

export function availableDirectoryActions(state:CityDirectoryState,signer:string):DirectoryAction[]{
  if(signer===state.content.ownerPubkey)return ["owner-update","rotate"];
  if(state.content.operatorPubkeys.includes(signer))return ["operator-update"];
  if(state.content.recoveryPubkeys.includes(signer))return ["recover"];
  return [];
}

export default function CityDirectorySuccessor(){
  const lock=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("Load an exact trust anchor to manage its signed successor chain."),[loaded,setLoaded]=useState<LoadedDirectory|null>(null),[action,setAction]=useState<DirectoryAction|null>(null);
  async function load(formEvent:FormEvent<HTMLFormElement>){
    formEvent.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setLoaded(null);setAction(null);
    try{
      const form=new FormData(formEvent.currentTarget),identity=await getBrowserExtensionPubkey();
      const anchor={cityId:String(form.get("cityId")??"").trim(),rootEventId:eventId(String(form.get("rootEventId")??"")),initialOwnerPubkey:publicKey(String(form.get("initialOwner")??""),"Initial owner")};
      const {state}=await discoverCityDirectoryChainForSigning(relayConfig.directoryRelays,anchor);
      if(await getBrowserExtensionPubkey()!==identity)throw new Error("Signer identity changed while loading the chain. Reconnect and retry.");
      const actions=availableDirectoryActions(state,identity);
      setLoaded({anchor,state,identity});setAction(actions[0]??null);
      setMessage(actions.length?`Verified sequence ${state.content.sequence} at ${state.currentEvent.id} through every configured transport. Choose an authorized successor action.`:`Verified sequence ${state.content.sequence}, but the connected signer is not its owner, operator or recovery identity.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not load the signed directory chain.");}
    finally{lock.current=false;setBusy(false);}
  }
  async function submit(formEvent:FormEvent<HTMLFormElement>){
    formEvent.preventDefault();if(lock.current||!loaded||!action)return;lock.current=true;setBusy(true);
    try{
      const identity=await getBrowserExtensionPubkey();
      if(identity!==loaded.identity)throw new Error("Signer identity changed. Reload the signed chain before continuing.");
      const current=await discoverCityDirectoryChainForSigning(relayConfig.directoryRelays,loaded.anchor);
      if(current.state.currentEvent.id!==loaded.state.currentEvent.id)throw new Error("The signed directory advanced after review. Reload it before signing.");
      if(!availableDirectoryActions(current.state,identity).includes(action))throw new Error("The connected signer is no longer authorized for this transition.");
      const form=new FormData(formEvent.currentTarget),previous=current.state.currentEvent;
      const primary=String(form.get("primary")??""),mirrors=lines(form.get("mirrors"));
      const template=action==="owner-update"
        ?createCityDirectoryOwnerUpdate(previous,{signerPubkey:identity,operatorPubkeys:lines(form.get("operators")).map(value=>publicKey(value,"Each operator")),recoveryPubkey:publicKey(String(form.get("recovery")??""),"Recovery key"),primaryRelay:primary,mirrorRelays:mirrors})
        :action==="operator-update"
          ?createCityDirectoryOperatorUpdate(previous,{signerPubkey:identity,primaryRelay:primary,mirrorRelays:mirrors})
          :action==="rotate"
            ?createCityDirectoryRotation(previous,{signerPubkey:identity,nextOwnerPubkey:publicKey(String(form.get("nextOwner")??""),"Next owner")})
            :createCityDirectoryRecovery(previous,{signerPubkey:identity,nextOwnerPubkey:publicKey(String(form.get("nextOwner")??""),"Recovered owner")});
      if(!window.confirm(`Sign ${action} sequence ${current.state.content.sequence+1} after ${previous.id}? This appends a permanent successor and never overwrites history.`))throw new Error("Signing cancelled; nothing was published.");
      setMessage(`Approve the exact ${action} successor in your connected signer…`);
      const signed=verifySignedCityDirectorySuccessor(await signWithBrowserExtension(template),template,identity);
      if(await getBrowserExtensionPubkey()!==identity)throw new Error("Signer identity changed after signing. The event was not published.");
      setMessage(`Publishing ${signed.id} and reading it back independently from every configured transport…`);
      await publishAndConfirmCityDirectoryRoot(signed,current.relays,(event,relays,required)=>publishVerifiedEvent(event,relays,required,authenticateWithBrowserExtension));
      const accepted=await discoverCityDirectoryChainForSigning(current.relays,loaded.anchor);
      if(accepted.state.currentEvent.id!==signed.id)throw new Error("The signed successor was published but did not become the single resolved current event. Stop and audit the chain.");
      setLoaded({...loaded,state:accepted.state});setAction(null);setMessage(`Successor ${signed.id} accepted at sequence ${accepted.state.content.sequence} through every configured transport.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Directory successor publication failed.");}
    finally{lock.current=false;setBusy(false);}
  }
  const actions=loaded?availableDirectoryActions(loaded.state,loaded.identity):[],content=loaded?.state.content,primary=content?.publicRelays[0]?.url??"",mirrors=content?.publicRelays.slice(1).map(relay=>relay.url).join("\n")??"";
  return <section><h2>Manage signed directory</h2><p>Load an explicit trust anchor. Every configured transport must independently resolve the same current event before a successor can be signed.</p><form onSubmit={load}><fieldset disabled={busy}><label>City ID <input name="cityId" required placeholder="00000000-0000-4000-8000-000000000000"/></label><label>Trust anchor event ID <input name="rootEventId" required autoComplete="off" spellCheck={false}/></label><label>Initial owner npub <input name="initialOwner" required autoComplete="off" spellCheck={false}/></label><button type="submit">Load signed chain</button></fieldset></form><p role="status" aria-live="polite">{message}</p>{loaded&&<div><p>Current event: <code>{loaded.state.currentEvent.id}</code></p><p>Sequence: {loaded.state.content.sequence}</p><p>Current owner: <code>{loaded.state.content.ownerPubkey}</code></p>{actions.length>0&&<form key={loaded.state.currentEvent.id} onSubmit={submit}><fieldset disabled={busy}><label>Authorized action <select value={action??""} onChange={event=>setAction(event.target.value as DirectoryAction)}>{actions.map(value=><option key={value} value={value}>{value}</option>)}</select></label>{(action==="owner-update"||action==="operator-update")&&<><label>Primary public city relay <input name="primary" type="url" required defaultValue={primary}/></label><label>Public mirror relays <textarea name="mirrors" defaultValue={mirrors}/></label></>}{action==="owner-update"&&<><label>Recovery npub <input name="recovery" required defaultValue={content?.recoveryPubkeys[0]}/></label><label>Operator npubs <textarea name="operators" defaultValue={content?.operatorPubkeys.join("\n")}/></label></>}{(action==="rotate"||action==="recover")&&<label>Next owner npub <input name="nextOwner" required autoComplete="off" spellCheck={false}/></label>}<button type="submit">Review and sign successor</button></fieldset></form>}</div>}</section>;
}
