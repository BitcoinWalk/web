"use client";
import Image from "next/image";
import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from "react";
import {createPortal} from "react-dom";
import CityFinder from "../../../components/city-finder";
import {useDashboard} from "../../../components/dashboard-context";
import {signWithBrowserExtension} from "../../../nostr/signer";
import {authorizeProSetup, proSetupTemplate} from "../../../nostr/pro-setup-command";
import type {ProSetupPreview} from "../../../server/pro-setup";
import CitySignerSetup from "../../../components/city-signer-setup";
import CityBrandReview from "../../../components/city-brand-review";
import CityProvisioningRecovery from "../../../components/city-provisioning-recovery";
import {responseJSON} from "../../../lib/response-json";
import communityStyles from "./community-visibility.module.css";
import styles from "./pro-setup.module.css";

export type ProSetupJourney={mode:"resume"|"waiting"|"complete"|"manage"|"attention";title:string;badge:string;actor:"You"|"BitcoinWalk";nextTitle:string;nextDetail:string;target?:"payout"|"signer";completed:number;total:number};
type SavedPayout={destination:string;version:number;update:"not-required"|"queued"|"deferred";message:string};
export function payoutErrorMessage(message:string){
  if(message.includes("reviewed payment service"))return "This wallet uses a payment service BitcoinWalk has not approved yet. Your address was not saved. Contact BitcoinWalk with your wallet provider’s name, or use another Lightning address. No funds were sent.";
  if(/timed out|timeout|failed to fetch/i.test(message))return "We could not finish checking your wallet. Check your connection and try again. If you already approved the request, reload Pro services to check whether it was saved. No funds were sent.";
  return message;
}
export function withSavedPayout(preview:ProSetupPreview,payout:SavedPayout):ProSetupPreview{
  const detail=payout.update==="queued"?`Destination version ${payout.version} is being verified. The current destination remains active until it passes.`:
    payout.update==="deferred"?`Destination version ${payout.version} is saved. Automatic verification will retry safely.`:
    `Owner-confirmed destination version ${payout.version} is saved privately. It is not active until provisioning is verified.`;
  return {...preview,payout:{configured:true,destination:payout.destination,version:payout.version},
    steps:preview.steps.map(step=>step.label==="Personal payout destination"?{...step,state:"ready",detail}:step)};
}
export function proSetupJourney(preview:ProSetupPreview,now=Date.now()):ProSetupJourney{
  const completed=preview.steps.filter(step=>step.state==="ready").length,total=preview.steps.length;
  if(preview.capabilities.overall==="active"&&preview.payout.configured&&preview.signer.configured)return {mode:"manage",title:"Manage Pro",badge:"Active",actor:"You",nextTitle:"Your Pro services are active",nextDetail:"Manage the payout destination, public community visibility and city identity below.",completed,total};
  if(preview.activation?.status==="active"||preview.activation?.status==="approved")return {mode:"complete",title:"Pro setup complete",badge:"Complete",actor:"You",nextTitle:"Your part is finished",nextDetail:"BitcoinWalk handles publication and service checks in the background. You do not need to return to this setup.",completed,total};
  if(preview.capabilities.overall==="needs-attention")return {mode:"attention",title:"Pro setup needs attention",badge:"Needs review",actor:"BitcoinWalk",nextTitle:"BitcoinWalk needs to review provisioning",nextDetail:`Your saved identity and payout remain unchanged. ${preview.capabilities.detail}`,completed,total};
  if(preview.activation?.proofsReady&&preview.activation.expiresAt*1000>now)return {mode:"waiting",title:"Setup submitted",badge:"Awaiting review",actor:"BitcoinWalk",nextTitle:"BitcoinWalk reviews and activates your services",nextDetail:"Your signed request is saved. There is nothing else for you to sign while it is under review.",completed,total};
  if(preview.capabilities.overall==="provisioning"&&preview.payout.configured&&preview.signer.configured)return {mode:"waiting",title:"Activation in progress",badge:"Provisioning",actor:"BitcoinWalk",nextTitle:"BitcoinWalk is verifying the public services",nextDetail:preview.capabilities.detail,completed,total};
  if(!preview.payout.configured)return {mode:"resume",title:"Resume Pro setup",badge:"In progress",actor:"You",nextTitle:"Confirm the payout destination",nextDetail:"Add the private destination that receives 79% of city payments. Nothing becomes active until verification succeeds.",target:"payout",completed,total};
  if(!preview.signer.configured)return {mode:"resume",title:"Resume Pro setup",badge:"In progress",actor:"You",nextTitle:"Connect the city identity",nextDetail:"Reuse the existing verified city identity when available, or connect a recoverable dedicated signer.",target:"signer",completed,total};
  return {mode:"resume",title:"Resume Pro setup",badge:"Ready to submit",actor:"You",nextTitle:"Sign the private activation request",nextDetail:"Reconnect the saved city identity, then sign once for the host and once for the city. The request can safely be resumed if signing is cancelled.",target:"signer",completed,total};
}

function ShieldIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
function BoltIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-9 12h8l-1 8 9-12h-8z"/></svg>}
async function signProSetup(template:Parameters<typeof signWithBrowserExtension>[0]){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([signWithBrowserExtension(template),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Your signer did not respond. Open it, then select Retry Pro services.")),60_000);})]);}
  finally{if(timer)clearTimeout(timer);}
}

export default function ProSetupScreen({enabled}: {enabled: boolean}) {
  const {pubkey, cities, role} = useDashboard();
  if(role==="super-admin")return enabled?<><CityBrandReview actor={pubkey}/><CityProvisioningRecovery actor={pubkey} cities={cities}/></>:<p role="status">Pro city account review is not enabled yet.</p>;
  // Remount on account changes so private setup responses never cross login boundaries.
  return <ProSetupForm key={pubkey} enabled={enabled} actor={pubkey} cities={cities}/>;
}
export function ProCitySetup({enabled,cityId,active=true,onClose}:{enabled:boolean;cityId:string;active?:boolean;onClose?():void}){
  const {pubkey,cities}=useDashboard();
  const mounted=useSyncExternalStore(()=>()=>{},()=>true,()=>false),dialog=useRef<HTMLElement>(null),previousFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!active)return;
    previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const frame=requestAnimationFrame(()=>dialog.current?.focus());
    function keydown(event:KeyboardEvent){
      if(event.key==="Escape"){event.preventDefault();onClose?.();return;}
      if(event.key!=="Tab"||!dialog.current)return;
      const controls=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(node=>node.offsetParent!==null);
      if(!controls.length){event.preventDefault();dialog.current.focus();return;}
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    document.addEventListener("keydown",keydown);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener("keydown",keydown);document.body.style.overflow=previousOverflow;previousFocus.current?.focus();};
  },[active,onClose]);
  if(!mounted||!active)return null;
  return createPortal(<div className={styles.modalBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget)onClose?.();}}>
    <section ref={dialog} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pro-setup-dialog-title" tabIndex={-1}>
      <header className={styles.modalHeader}><div><p className={styles.eyebrow}>{cities.find(city=>city.id===cityId)?.name??"Your city"}</p><h2 id="pro-setup-dialog-title">Pro city services</h2></div><button className={styles.modalClose} type="button" aria-label="Close Pro services" onClick={onClose}>×</button></header>
      <div className={styles.modalBody}><ProSetupForm key={`${pubkey}:${cityId}`} enabled={enabled} actor={pubkey} cities={cities} fixedCityId={cityId} embedded modal onExit={onClose}/></div>
    </section>
  </div>,document.body);
}
function ProSetupForm({enabled, actor, cities, fixedCityId="", embedded=false,modal=false,onExit}: {enabled: boolean; actor: string; cities: Array<{id: string; name: string}>;fixedCityId?:string;embedded?:boolean;modal?:boolean;onExit?():void}) {
  const [cityId, setCityId] = useState(fixedCityId), [preview, setPreview] = useState<ProSetupPreview | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [destination, setDestination] = useState(""), [payoutMessage,setPayoutMessage]=useState("");
  const [payoutValidation,setPayoutValidation]=useState<{amountMsat:number;payment:"verified";nip57:"verified"|"unverified"|"not-advertised"}|null>(null);
  const [payoutPhase,setPayoutPhase]=useState<"idle"|"signing"|"checking"|"success"|"error">("idle");
  const [selectedStep,setSelectedStep]=useState<1|2|3|null>(null);
  const inFlight = useRef(false);
  const deepLinkApplied = useRef(false);
  useEffect(()=>{
    if(fixedCityId)return;
    if(deepLinkApplied.current||!cities.length)return;
    deepLinkApplied.current=true;
    const requested=new URLSearchParams(window.location.search).get("city");
    if(!requested||!cities.some(city=>city.id===requested))return;
    let active=true;
    queueMicrotask(()=>{if(active){setCityId(requested);setMessage("Your Pro city is selected. Verify it with your signer to continue from the saved setup state.");}});
    return()=>{active=false;};
  },[cities,fixedCityId]);
  const prepare=useCallback(async function prepare() {
    if (!cityId || !actor || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(embedded?"Confirm the private Pro-services check in your signer…":""); setPreview(null);
    try {
      const command = {action: "preview" as const, cityId}, origin = window.location.origin;
      const event = await signProSetup(proSetupTemplate(command, origin));
      if (event.pubkey !== actor || JSON.stringify(authorizeProSetup(event, origin)) !== JSON.stringify(command)) {
        throw new Error("Your signer changed the setup request. Reconnect and try again.");
      }
      const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({event}), signal: AbortSignal.timeout(60_000)});
      const body = await responseJSON<{error?:string;preview:ProSetupPreview}>(response);
      if (!response.ok) throw new Error(body.error || "Pro setup could not be prepared.");
      setPreview(body.preview); setDestination(body.preview.payout.destination ?? body.preview.payout.suggestedDestination ?? ""); setPayoutMessage(""); setPayoutPhase("idle");setSelectedStep(null);setPayoutValidation(null); setMessage("Pro services loaded.");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Preparation failed; no account or payment was changed.");}
    finally {inFlight.current = false; setBusy(false);}
  },[actor,cityId,embedded]);
  async function savePayout() {
    if (!preview || !destination.trim() || !actor || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(""); setPayoutPhase("signing");setPayoutValidation(null);setPayoutMessage("Open your signer and approve this address. This does not send a payment.");
    try {
      const command = {action: "save-payout" as const, cityId: preview.cityId, destination: destination.trim()}, origin = window.location.origin;
      const event = await signProSetup(proSetupTemplate(command, origin));
      if (event.pubkey !== actor || JSON.stringify(authorizeProSetup(event, origin)) !== JSON.stringify(command)) throw new Error("Your signer changed the payout request. Reconnect and try again.");
      setPayoutPhase("checking");setPayoutMessage("Checking that your wallet can receive payments…");
      const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({event}), signal: AbortSignal.timeout(60_000)});
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Payout destination could not be saved.");
      setPreview(value => value ? {...value, payout: {configured: true, destination: body.payout.destination, version: body.payout.version,
        ...(body.payout.update==="not-required"&&value.payout.activation?{activation:value.payout.activation}:body.payout.update!=="not-required"?{activation:{activeVersion:value.payout.activation?.activeVersion,pendingVersion:body.payout.version,state:"pending"}}:{})},
        steps: value.steps.map(step => step.label === "Personal payout destination" ? {...step, state: "ready", detail: body.payout.update==="queued"?`Destination version ${body.payout.version} is being verified. The current destination remains active until it passes.`:`Owner-confirmed destination version ${body.payout.version} is saved privately. It is not active until provisioning is verified.`} : step)} : value);
      setDestination(body.payout.destination);setSelectedStep(1); setPayoutValidation(body.payout.validation);setPayoutPhase("success"); setPayoutMessage("Address saved. No funds were sent. Activation checks still need to finish before it receives payments.");
    } catch (error) {const note=error instanceof Error ? error.message : "Destination was not saved. Try again.";setPayoutPhase("error");setPayoutMessage(payoutErrorMessage(note));}
    finally {inFlight.current = false; setBusy(false);}
  }
  async function setCommunityVisibility(surface:"walkie-talkie"|"armada",enabled:boolean){
    if(!preview||!actor||inFlight.current)return;
    const label=surface==="walkie-talkie"?"Walkie Talkie":"Armada";
    inFlight.current=true;setBusy(true);setMessage(`Approve the ${label} visibility change in your signer.`);
    try{
      const command={action:"set-community-visibility" as const,cityId:preview.cityId,surface,enabled},origin=window.location.origin;
      const event=await signWithBrowserExtension(proSetupTemplate(command,origin));
      if(event.pubkey!==actor||JSON.stringify(authorizeProSetup(event,origin))!==JSON.stringify(command))throw new Error("Your signer changed the community visibility request. Reconnect and try again.");
      const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60_000)}),body=await responseJSON<{error?:string;community:ProSetupPreview["community"]&{message:string}}>(response);
      if(!response.ok)throw new Error(body.error||`${label} visibility could not be changed.`);
      setPreview(value=>value?{...value,community:body.community}:value);setMessage(body.community.message);
    }catch(error){setMessage(error instanceof Error?error.message:`${label} visibility was not changed.`);}
    finally{inFlight.current=false;setBusy(false);}
  }
  const journey=preview?proSetupJourney(preview):null,manage=journey?.mode==="manage",setupComplete=journey?.mode==="complete";
  const savedDestination=preview?.payout.destination?.trim()??"",destinationChanged=destination.trim()!==savedDestination;
  const payoutState=preview?.payout.activation?.state??"not-active";
  const payoutStatus=payoutState==="active"?"Active":payoutState==="pending"?"Verifying":payoutState==="needs-attention"?"Needs attention":preview?.payout.configured?"Saved":preview?.payout.suggestedDestination?"Confirm address":"Add address";
  const showCommunity=!!preview&&(preview.community.walkieTalkieActive||preview.community.armadaActive);
  const wizardStep=!preview?.payout.configured?1:!preview?.signer.configured?2:3;
  const displayedStep=selectedStep??wizardStep;
  const viewedTitle=displayedStep===1?(preview?.payout.configured?"Review payout destination":"Confirm the payout destination"):displayedStep===2?(preview?.signer.configured?"Review the city identity":"Set up the city identity"):"Sign the activation request";
  const viewedDetail=displayedStep===wizardStep?journey?.nextDetail:displayedStep===1?"Review or update the saved destination, then return to the current step.":displayedStep===2?"Complete this now and return to the payout step later.":"Reconnect the saved city identity to sign and submit.";
  function leaveSetup(){if(onExit){onExit();return;}setPreview(null);setMessage("Your progress is saved. You can resume Pro setup at any time.");}
  return <section className={styles.shell} id={embedded?"pro-city-services":undefined} aria-label={embedded?"Pro city services":undefined} data-modal={modal||undefined}>
    {!embedded&&<div className={styles.intro}><h1>Upgrade your city</h1>
      <p>Your personal account remains your dashboard login. The city has a separate public identity, payout destination and services.</p>
    </div>}
    {!enabled ? <p role="status">This setup is being prepared and is not available yet. Your Pro payment remains recorded; do not pay again.</p> : <>
      {!fixedCityId&&<CityFinder label="Your city" placeholder="Search your cities…" value={cityId} disabled={busy} items={cities}
        onChange={id => {setCityId(id); setPreview(null); setDestination(""); setMessage("");}}/>}
      {!embedded&&<button type="button" onClick={() => void prepare()} disabled={busy || !cityId || !actor}>{busy ? "Preparing…" : "Verify and preview Pro setup"}</button>}
      <p className={styles.privateCheck}><ShieldIcon/>{embedded?"This private status check is read-only and is never published to Nostr.":"Your signer confirms a private, read-only request. It is not published to Nostr."}</p>
      {!preview&&message && <p className={styles.message} role="alert">{message}</p>}
      {embedded&&!preview&&<button className={styles.retry} type="button" onClick={()=>void prepare()} disabled={busy||!cityId||!actor}>{busy?"Waiting for signer…":message?"Retry Pro services":"Verify and load Pro services"}</button>}
      {preview && <section aria-label="Prepared city profile">
        {setupComplete&&journey?<section className={styles.completeState} aria-label="Pro setup complete">
          <span className={styles.completeIcon} aria-hidden="true">✓</span>
          <div><p className={styles.eyebrow}>{preview.cityName} Pro</p><h3>{journey.title}</h3><p>{journey.nextDetail}</p></div>
          <button type="button" onClick={leaveSetup}>Done</button>
        </section>:manage&&journey?<section className={styles.manageState} aria-label="Pro services active">
          <span className={styles.completeIcon} aria-hidden="true">✓</span><div><h3>Pro services active</h3><p>Setup is complete. Manage the city services below.</p></div>
        </section>:journey&&<section className={styles.journey} aria-label="Pro setup progress">
          <div className={styles.journeyTop}><div><p className={styles.eyebrow}>{preview.cityName} Pro</p><h3>{journey.title}</h3><p>Every completed step is saved. You can leave and return without paying again or creating another identity.</p></div><span className={styles.state} data-tone={journey.mode}>{journey.badge}</span></div>
          <div className={styles.progress}><div className={styles.progressLabel}><span>Setup progress</span><span>{journey.completed} of {journey.total} complete</span></div><div className={styles.progressTrack} role="progressbar" aria-label="Pro setup completion" aria-valuemin={0} aria-valuemax={journey.total} aria-valuenow={journey.completed}><span style={{width:`${Math.round(journey.completed/journey.total*100)}%`}}/></div></div>
          {journey.mode!=="manage"&&<ol className={styles.wizardSteps} aria-label="Pro setup steps"><li data-state={displayedStep===1?"current":preview.payout.configured?"complete":undefined}><span>{preview.payout.configured?"✓":"1"}</span><b>Payout</b></li><li data-state={displayedStep===2?"current":preview.signer.configured?"complete":undefined}><span>{preview.signer.configured?"✓":"2"}</span><b>City identity</b></li><li data-state={displayedStep===3?"current":undefined}><span>3</span><b>Sign &amp; submit</b></li></ol>}
          <div className={styles.nextAction}><span className={styles.nextIcon}>{journey.mode==="manage"?"✓":journey.actor==="You"?displayedStep:"…"}</span><span className={styles.nextCopy}><small>{journey.actor}&apos;s next step</small><strong>{journey.mode==="resume"?viewedTitle:journey.nextTitle}</strong><span>{journey.mode==="resume"?viewedDetail:journey.nextDetail}</span></span></div>
        </section>}
        {journey&&journey.mode==="resume"&&<nav className={styles.wizardNav} aria-label="Setup navigation">
          <span>{displayedStep>1&&<button type="button" onClick={()=>setSelectedStep((displayedStep-1) as 1|2)} disabled={busy}><span aria-hidden="true">←</span> Back</button>}</span>
          {displayedStep===1?<button type="button" onClick={()=>setSelectedStep(2)} disabled={busy}>Skip for now</button>:<button type="button" onClick={leaveSetup} disabled={busy}>{displayedStep===3?"Finish later":"Skip for now"}</button>}
        </nav>}
        {message&&<p className={styles.message} role="status">{message}</p>}
        {manage&&<details className={styles.disclosure}><summary>Public city identity <span>{preview.capabilities.overall==="active"?"Active":"Preview"}</span></summary><div className={styles.disclosureBody}>
        <h2>{preview.profile.display_name}</h2>
        <Image className={styles.banner} unoptimized src={preview.profile.banner} alt={`${preview.cityName} profile banner`} width={1500} height={500}/>
        <p><Image unoptimized src={preview.profile.picture} alt={`${preview.cityName} BitcoinWalk avatar`} width={128} height={128} style={{borderRadius: "50%"}}/></p>
        <p>Website: <a href={preview.profile.website}>{preview.profile.website}</a></p>
        {preview.profile.nip05 && <p>NIP-05: <strong>{preview.profile.nip05}</strong></p>}
        <section aria-label="City service status"><h3>City services</h3><p><strong>{preview.capabilities.overall}</strong> — {preview.capabilities.detail}</p>
          <ul><li>NIP-05: <strong>{preview.capabilities.nip05}</strong></li><li>Lightning address: <strong>{preview.capabilities.lightning}</strong></li></ul></section>
        </div></details>}
        {showCommunity&&manage&&<fieldset className={communityStyles.panel} disabled={busy}>
          <legend>Community visibility</legend>
          <p className={communityStyles.intro}>Choose which community options appear on this city&apos;s public pages. Hiding one keeps its channel and message history intact.</p>
          <div className={communityStyles.list}>
            <div className={communityStyles.service} data-available={preview.community.walkieTalkieActive||undefined}>
              <span className={communityStyles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg></span>
              <span className={communityStyles.copy}><strong>Walkie Talkie</strong><span>NIP-29 messaging with NIP-17 support</span>{!preview.community.walkieTalkieActive&&<small>Awaiting channel activation</small>}</span>
              <button className={communityStyles.switch} type="button" role="switch" aria-checked={preview.community.walkieTalkieEnabled} aria-label={`${preview.community.walkieTalkieEnabled?"Hide":"Show"} Walkie Talkie on public city and walk pages`} onClick={()=>void setCommunityVisibility("walkie-talkie",!preview.community.walkieTalkieEnabled)} disabled={busy||!preview.community.walkieTalkieActive}><span className={communityStyles.state}>{preview.community.walkieTalkieEnabled?"Shown":"Hidden"}</span><span className={communityStyles.track} aria-hidden="true"><span/></span></button>
            </div>
            <div className={communityStyles.service} data-available={preview.community.armadaActive||undefined}>
              <span className={communityStyles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7z"/><path d="m9 12 2 2 4-4"/></svg></span>
              <span className={communityStyles.copy}><strong>Armada</strong><span>Private Concord community</span>{!preview.community.armadaActive&&<small>Awaiting Armada activation</small>}</span>
              <button className={communityStyles.switch} type="button" role="switch" aria-checked={preview.community.armadaEnabled} aria-label={`${preview.community.armadaEnabled?"Hide":"Show"} Armada on public city and walk pages`} onClick={()=>void setCommunityVisibility("armada",!preview.community.armadaEnabled)} disabled={busy||!preview.community.armadaActive}><span className={communityStyles.state}>{preview.community.armadaEnabled?"Shown":"Hidden"}</span><span className={communityStyles.track} aria-hidden="true"><span/></span></button>
            </div>
          </div>
        </fieldset>}
        {journey&&(journey.mode!=="resume"||displayedStep===1)&&<fieldset className={`${styles.section} ${styles.payoutCard}`} id={`pro-payout-${cityId}`} disabled={busy}>
          <legend>Your receiving wallet</legend>
          <div className={styles.payoutHeader}><span className={styles.payoutIcon}><BoltIcon/></span><span><strong>Host payout destination</strong><small>Receives your 79% share of city payments</small></span><span className={styles.payoutState} data-state={payoutState}>{payoutStatus}</span></div>
          {preview.payout.configured&&<div className={styles.currentPayout}><span>Current saved destination</span><strong>{preview.payout.destination}</strong><small>Version {preview.payout.version}{preview.payout.activation?.activeVersion?` · active version ${preview.payout.activation.activeVersion}`:""}</small></div>}
          <label>{preview.payout.configured?"New Lightning address or LNURL-pay":"Lightning address or LNURL-pay"}
            <input value={destination} onChange={event => {setDestination(event.target.value);setPayoutMessage("");setPayoutValidation(null);setPayoutPhase("idle");}} placeholder="you@example.com or lnurl1…" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby={`payout-help-${cityId}`} aria-invalid={payoutPhase==="error"||undefined}/>
          </label>
          <p className={styles.payoutHelp} id={`payout-help-${cityId}`}>Your wallet receives 79%; BitcoinWalk retains 21%. This check sends no funds.</p>
          {!preview.payout.configured && preview.payout.suggestedDestination && <p className={styles.payoutHelp}>Filled in from checkout. Check the address, then confirm it with your signer.</p>}
          <div className={styles.payoutActions}><button type="button" onClick={() => void savePayout()} disabled={busy || !destination.trim() || (preview.payout.configured&&!destinationChanged)}>{payoutPhase==="signing" ? "Waiting for signer…" : payoutPhase==="checking" ? "Checking wallet…" : preview.payout.configured ? "Save new address" : "Confirm receiving address"}</button>{preview.payout.configured&&!destinationChanged&&<small>Enter a different destination to update it.</small>}</div>
          {payoutMessage&&<p className={styles.payoutFeedback} data-state={payoutPhase} role={payoutPhase==="error"?"alert":"status"}>{payoutMessage}</p>}
          {payoutPhase==="success"&&journey.mode==="resume"&&<button type="button" onClick={()=>setSelectedStep(preview.signer.configured?3:2)}>Continue to {preview.signer.configured?"activation":"city identity"} →</button>}
          <details className={styles.payoutDetails}><summary>How verification works</summary><p className={styles.payoutHelp}>BitcoinWalk checks that your wallet can create a valid invoice, but does not pay it. Your current destination stays active until the signed replacement passes provider and public read-back checks.</p>
          {payoutValidation&&<div className={styles.validationResult} aria-label="Payout validation result"><strong>✓ Lightning receive check passed</strong><span>The provider issued a valid, unpaid {payoutValidation.amountMsat/1000}-sat mainnet invoice with the correct amount, expiry and metadata commitment.</span><small>{payoutValidation.nip57==="verified"?"NIP-57 zap invoice verified (unpaid).":payoutValidation.nip57==="unverified"?"The provider advertises NIP-57, but its zap invoice could not be verified. Ordinary Lightning payouts remain valid.":"NIP-57 zap support is not advertised. Ordinary Lightning payouts remain valid."}</small></div>}
          </details>
        </fieldset>}
        {journey&&(manage||journey.mode==="resume"&&(displayedStep===2||displayedStep===3))&&<div className={styles.section} id={`pro-signer-${cityId}`} tabIndex={-1}><CitySignerSetup cityId={preview.cityId} cityName={preview.cityName} actor={actor} saved={preview.signer} activation={preview.activation?.status==="pending"?preview.activation:undefined} profile={preview.profile} stage={manage?undefined:displayedStep===2?2:3}
          setupReady={preview.payout.configured&&preview.signer.configured} busy={busy}
          onSaved={(signer, note) => {setPreview(value => value ? {...value, signer,steps:value.steps.map(step=>step.label==="City signer"?{...step,state:signer.configured?"ready":"blocked",detail:signer.configured?`Expected city signer version ${signer.version} is confirmed privately. Its key remains outside BitcoinWalk.`:`Create or connect a recoverable city identity, or reuse the owner account when its public profile is already named BitcoinWalk in ${preview.cityName}.`}:step)} : value);setSelectedStep(signer.configured?(preview.payout.configured?3:1):2);setMessage(note);}}
          onContinue={()=>setSelectedStep(preview.payout.configured?3:1)}
          onActivation={(activation,note)=>{setPreview(value=>value?{...value,activation}:value);setMessage(note);}}/></div>}
        {manage&&journey&&<details className={styles.disclosure}><summary>Completed setup details <span>{journey.completed}</span></summary><div className={styles.disclosureBody}><ol className={styles.stepList}>{preview.steps.filter(step=>step.state==="ready").map(step=><li key={step.label}><b>✓</b><div><strong>{step.label}</strong><p>{step.detail}</p></div></li>)}</ol></div></details>}
        {!setupComplete&&<details className={styles.payoutDetails}><summary>Privacy and security</summary><p className={styles.safeReturn}>BitcoinWalk never stores the city private key or remote-signer connection. Saved payout and identity details remain private until reviewed activation succeeds.</p></details>}
      </section>}
    </>}
  </section>;
}
