"use client";
import {useRef,useState} from "react";
import {useDashboard} from "../../../components/dashboard-context";
import {signWithBrowserExtension} from "../../../nostr/signer";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {MADEIRA_PILOT,madeiraRequest,madeiraProofTemplate,authorizeMadeiraRequest,verifyMadeiraProof,type MadeiraChallenge,type MadeiraCommand} from "../../../nostr/madeira-pilot";
type View={challenge:MadeiraChallenge;ownerConfirmed:boolean;adminConfirmed:boolean;entitlement:string};
export default function MadeiraPilotScreen({enabled}:{enabled:boolean}){
  const {pubkey}=useDashboard();
  return <Pilot key={pubkey} enabled={enabled} actor={pubkey}/>;
}
function Pilot({enabled,actor}:{enabled:boolean;actor:string}){
  const [pilot,setPilot]=useState<View|null>(null),[state,setState]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  async function act(action:MadeiraCommand["action"]){
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    try{
      if(window.location.origin!==MADEIRA_PILOT.origin)throw new Error("This pilot is staging-only.");
      let proof;
      if(action==="owner"||action==="admin"){
        if(!pilot)throw new Error("Load the request first.");
        proof=await signWithBrowserExtension(madeiraProofTemplate(pilot.challenge,action));
        verifyMadeiraProof(proof,pilot.challenge,action,Math.floor(Date.now()/1000));
      }
      const event=await signWithBrowserExtension(madeiraRequest({action}));
      if(event.pubkey!==actor||authorizeMadeiraRequest(event).action!==action)throw new Error("Signer changed; reconnect.");
      const response=await fetch("/api/madeira-pilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,proof}),signal:AbortSignal.timeout(90_000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Pilot request failed.");
      setPilot(result.pilot);setState(result.provisioning?.state??"Not provisioned");
    }catch(e){setError(e instanceof Error?e.message:"Pilot failed safely.");}finally{lock.current=false;setBusy(false);}
  }
  if(!enabled)return <p>Private Madeira pilot is disabled.</p>;
  if(actor!==MADEIRA_PILOT.pubkey&&actor!==SUPER_ADMIN_PUBKEY)return <p>Connect BitcoinWalk in Madeira or the BitcoinWalk super-admin to use this private pilot.</p>;
  return <section><h1>Madeira — private staging pilot</h1>
    <p><strong>No payment required. Do not pay the checkout invoice.</strong> This is a test-only entitlement, not paid Pro status.</p>
    <p>Reuse BitcoinWalk in Madeira. No new account, ownership transfer, public profile update, NIP-05, Lightning address or payment activation.</p>
    <p>First approve Madeira in the staging city requests using the super-admin. Then use the existing Madeira account below.</p>
    <button disabled={busy} onClick={()=>void act("load")}>{busy?"Checking…":"Load private pilot request"}</button>
    {error&&<p role="alert">{error}</p>}
    {pilot&&<><h2>Review before signing</h2><p>City: Madeira (staging only)</p>
      <p>Account: <code>{MADEIRA_PILOT.pubkey}</code></p><p>Saved payout destination: <strong>{pilot.challenge.snapshot.payoutDestination}</strong></p>
      <p>Account proof: {pilot.ownerConfirmed?"Confirmed":"Awaiting Madeira account"}. Super-admin test grant: {pilot.adminConfirmed?"Confirmed":"Awaiting signature"}.</p>
      <p>Fixture provisioning: {state}. Invoices and public endpoints remain disabled, including when this says verified.</p>
      {actor===MADEIRA_PILOT.pubkey&&<button disabled={busy||pilot.ownerConfirmed} onClick={()=>void act("owner")}>Sign account control and confirm payout</button>}
      {actor===SUPER_ADMIN_PUBKEY&&<button disabled={busy||!pilot.ownerConfirmed||pilot.adminConfirmed} onClick={()=>void act("admin")}>Sign staging-only test entitlement</button>}
      {pilot.adminConfirmed&&<button disabled={busy} onClick={()=>void act("retry")}>Check / resume private provisioning</button>}
      <p>Signatures are saved privately. They are never published to Nostr. Each action may request two signatures: its proof and its authenticated request.</p>
    </>}
  </section>;
}
