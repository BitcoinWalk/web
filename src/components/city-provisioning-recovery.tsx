"use client";
import {useState} from "react";
import CityFinder from "./city-finder";
import {signWithBrowserExtension} from "../nostr/signer";
import {authorizeProSetup,proSetupTemplate} from "../nostr/pro-setup-command";

type Status={reservation?:{state:string}|null;activation?:{state:string;nip05:string;lnurl:string}|null;activationEnabled:boolean}|null;
export default function CityProvisioningRecovery({actor,cities}:{actor:string;cities:Array<{id:string;name:string}>}){
  const [cityId,setCityId]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[status,setStatus]=useState<Status>(null);
  async function retry(){if(!cityId||busy)return;setBusy(true);setMessage("");try{
    const origin=window.location.origin,command={action:"retry-city-provisioning" as const,cityId},event=await signWithBrowserExtension(proSetupTemplate(command,origin));
    if(event.pubkey!==actor||JSON.stringify(authorizeProSetup(event,origin))!==JSON.stringify(command))throw new Error("Connect the BitcoinWalk super-admin identity.");
    const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60_000)}),body=await response.json();
    if(!response.ok)throw new Error(body.error||"Provisioning status could not be checked.");setStatus(body.provisioning);setMessage("Provisioning state reconciled from durable records and provider read-back.");
  }catch(error){setMessage(error instanceof Error?error.message:"Provisioning recovery failed safely.");}finally{setBusy(false);}}
  return <section><h2>City address provisioning</h2><p>Check or safely resume private reservation, NIP-05 and Lightning activation. This never creates another Pro invoice or replaces changed authority.</p>
    <CityFinder label="City" placeholder="Search managed cities…" value={cityId} disabled={busy} items={cities} onChange={id=>{setCityId(id);setStatus(null);setMessage("");}}/>
    <button type="button" disabled={busy||!cityId} onClick={()=>void retry()}>{busy?"Checking…":"Check / retry provisioning"}</button>
    {message&&<p role="status">{message}</p>}{status&&<dl><div><dt>Private reservation</dt><dd>{status.reservation?.state??"setup-required"}</dd></div>
      <div><dt>Public activation</dt><dd>{status.activation?.state??(status.activationEnabled?"provisioning":"disabled")}</dd></div>
      <div><dt>NIP-05</dt><dd>{status.activation?.nip05??"setup-required"}</dd></div><div><dt>Lightning address</dt><dd>{status.activation?.lnurl??"setup-required"}</dd></div></dl>}
  </section>;
}
