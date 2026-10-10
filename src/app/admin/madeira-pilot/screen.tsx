"use client";
import {useRef,useState} from "react";
import {useDashboard} from "../../../components/dashboard-context";
import {signWithBrowserExtension} from "../../../nostr/signer";
import {SUPER_ADMIN_PUBKEY} from "../../../nostr/authority";
import {MADEIRA_PILOT,madeiraRequest,madeiraProofTemplate,authorizeMadeiraRequest,verifyMadeiraProof,type MadeiraChallenge,type MadeiraCommand} from "../../../nostr/madeira-pilot";
import {madeiraManagedProofTemplate,verifyMadeiraManagedProof,type MadeiraManagedChallenge} from "../../../nostr/madeira-managed-pilot";
import {madeiraManagedActivationProofTemplate,verifyMadeiraManagedActivationProof,type MadeiraManagedActivationChallenge} from "../../../nostr/madeira-managed-activation";
type View={challenge:MadeiraChallenge;ownerConfirmed:boolean;adminConfirmed:boolean;entitlement:string};
type ManagedView={challenge:MadeiraManagedChallenge;ownerConfirmed:boolean;adminConfirmed:boolean};
type ActivationView={challenge:MadeiraManagedActivationChallenge;ownerConfirmed:boolean;adminConfirmed:boolean};
export default function MadeiraPilotScreen({enabled}:{enabled:boolean}){
  const {pubkey}=useDashboard();
  return <Pilot key={pubkey} enabled={enabled} actor={pubkey}/>;
}
function Pilot({enabled,actor}:{enabled:boolean;actor:string}){
  const [pilot,setPilot]=useState<View|null>(null),[managed,setManaged]=useState<ManagedView|null>(null),[activation,setActivation]=useState<ActivationView|null>(null),
    [state,setState]=useState(""),[managedState,setManagedState]=useState(""),[activationState,setActivationState]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  async function act(action:MadeiraCommand["action"]){
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    try{
      if(window.location.origin!==MADEIRA_PILOT.origin)throw new Error("This pilot is staging-only.");
      let proof;
      if(action==="owner"||action==="admin"){
        if(!pilot)throw new Error("Load the request first.");proof=await signWithBrowserExtension(madeiraProofTemplate(pilot.challenge,action));
        verifyMadeiraProof(proof,pilot.challenge,action,Math.floor(Date.now()/1000));
      }
      if(action==="managed-owner"||action==="managed-admin"){
        if(!managed)throw new Error("Load the managed reservation request first.");const role=action==="managed-owner"?"owner":"admin";
        proof=await signWithBrowserExtension(madeiraManagedProofTemplate(managed.challenge,role));
        verifyMadeiraManagedProof(proof,managed.challenge,role,Math.floor(Date.now()/1000));
      }
      if(action==="activation-owner"||action==="activation-admin"){
        if(!activation)throw new Error("Load the managed public activation request first.");const role=action==="activation-owner"?"owner":"admin";
        proof=await signWithBrowserExtension(madeiraManagedActivationProofTemplate(activation.challenge,role));
        verifyMadeiraManagedActivationProof(proof,activation.challenge,role,Math.floor(Date.now()/1000));
      }
      const event=await signWithBrowserExtension(madeiraRequest({action}));
      if(event.pubkey!==actor||authorizeMadeiraRequest(event).action!==action)throw new Error("Signer changed; reconnect.");
      const response=await fetch("/api/madeira-pilot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event,proof}),signal:AbortSignal.timeout(90_000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Pilot request failed.");
      setPilot(result.pilot);setState(result.provisioning?.state??"Not provisioned");setManaged(result.managed??null);setActivation(result.activation??null);
      setManagedState(result.managedProvisioning?.reservation?.state??"Not reserved");setActivationState(result.managedProvisioning?.activation?.state??"Not activated");
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
    <hr/><h2>Managed reservation</h2>
    <p><strong>Still no payment required.</strong> This separately authorizes one disabled Madeira reservation on the production-shaped managed service. It cannot expose NIP-05, create a Lightning address, issue invoices or move funds.</p>
    <button disabled={busy} onClick={()=>void act("managed-load")}>{busy?"Checking…":"Load managed reservation request"}</button>
    {managed&&<><p>Account: <code>{MADEIRA_PILOT.pubkey}</code></p><p>Destination: <strong>{managed.challenge.snapshot.payoutDestination}</strong></p>
      <p>Madeira proof: {managed.ownerConfirmed?"Confirmed":"Awaiting Madeira account"}. Super-admin reservation grant: {managed.adminConfirmed?"Confirmed":"Awaiting signature"}.</p>
      <p>Managed reservation: {managedState}. Public activation: disabled.</p>
      {actor===MADEIRA_PILOT.pubkey&&<button disabled={busy||managed.ownerConfirmed} onClick={()=>void act("managed-owner")}>Authorize disabled managed reservation</button>}
      {actor===SUPER_ADMIN_PUBKEY&&<button disabled={busy||!managed.ownerConfirmed||managed.adminConfirmed} onClick={()=>void act("managed-admin")}>Authorize staging reservation</button>}
      {managed.adminConfirmed&&<button disabled={busy} onClick={()=>void act("managed-retry")}>Check / resume managed reservation</button>}
    </>}
    <hr/><h2>Public staging activation</h2>
    <p>This is separate from the reservation. It authorizes the exact Madeira NIP-05 and Lightning address, enables invoice issuance, and applies the 79/21 split to the saved personal payout destination.</p>
    <p><strong>Staging only:</strong> production remains unchanged. Do not use this section until managed reservation and payout recovery both pass.</p>
    <button disabled={busy||managedState!=="verified"} onClick={()=>void act("activation-load")}>{busy?"Checking…":"Load public activation request"}</button>
    {activation&&<><p>NIP-05: <strong>{activation.challenge.nip05}</strong></p><p>Lightning address: <strong>{activation.challenge.lightningAddress}</strong></p>
      <p>Organizer payout: <strong>{activation.challenge.reserved.payoutDestination}</strong> — 79%. BitcoinWalk retains 21% before routing fees.</p>
      <p>Madeira activation consent: {activation.ownerConfirmed?"Confirmed":"Awaiting Madeira account"}. Super-admin activation grant: {activation.adminConfirmed?"Confirmed":"Awaiting signature"}.</p>
      <p>Public activation: {activationState}. No production setting is changed by these signatures.</p>
      {actor===MADEIRA_PILOT.pubkey&&<button disabled={busy||activation.ownerConfirmed} onClick={()=>void act("activation-owner")}>Authorize Madeira public endpoints</button>}
      {actor===SUPER_ADMIN_PUBKEY&&<button disabled={busy||!activation.ownerConfirmed||activation.adminConfirmed} onClick={()=>void act("activation-admin")}>Authorize staging public activation</button>}
      {activation.adminConfirmed&&<button disabled={busy} onClick={()=>void act("activation-retry")}>Check / resume public activation</button>}
      <p>These private signatures bind the exact city account, payout destination, split, provider revision and enabled configuration. They are never published to Nostr.</p>
    </>}
  </section>;
}
