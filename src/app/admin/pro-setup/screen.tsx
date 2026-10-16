"use client";
import Image from "next/image";
import {useCallback, useEffect, useRef, useState} from "react";
import CityFinder from "../../../components/city-finder";
import {useDashboard} from "../../../components/dashboard-context";
import {signWithBrowserExtension} from "../../../nostr/signer";
import {authorizeProSetup, proSetupTemplate} from "../../../nostr/pro-setup-command";
import type {ProSetupPreview} from "../../../server/pro-setup";
import CitySignerSetup from "../../../components/city-signer-setup";
import CityBrandReview from "../../../components/city-brand-review";
import CityProvisioningRecovery from "../../../components/city-provisioning-recovery";
import communityStyles from "./community-visibility.module.css";
import styles from "./pro-setup.module.css";

export type ProSetupJourney={mode:"resume"|"waiting"|"manage"|"attention";title:string;badge:string;actor:"You"|"BitcoinWalk";nextTitle:string;nextDetail:string;target?:"payout"|"signer";completed:number;total:number};
export function proSetupJourney(preview:ProSetupPreview,now=Date.now()):ProSetupJourney{
  const completed=preview.steps.filter(step=>step.state==="ready").length,total=preview.steps.length;
  if(preview.capabilities.overall==="active"&&preview.payout.configured&&preview.signer.configured)return {mode:"manage",title:"Manage Pro",badge:"Active",actor:"You",nextTitle:"Your Pro services are active",nextDetail:"Manage the payout destination, public community visibility and city identity below.",completed,total};
  if(preview.capabilities.overall==="needs-attention")return {mode:"attention",title:"Pro setup needs attention",badge:"Needs review",actor:"BitcoinWalk",nextTitle:"BitcoinWalk needs to review provisioning",nextDetail:`Your saved identity and payout remain unchanged. ${preview.capabilities.detail}`,completed,total};
  if(preview.activation?.proofsReady&&preview.activation.expiresAt*1000>now)return {mode:"waiting",title:"Setup submitted",badge:"Awaiting review",actor:"BitcoinWalk",nextTitle:"BitcoinWalk reviews and activates your services",nextDetail:"Your signed request is saved. There is nothing else for you to sign while it is under review.",completed,total};
  if(preview.capabilities.overall==="provisioning"&&preview.payout.configured&&preview.signer.configured)return {mode:"waiting",title:"Activation in progress",badge:"Provisioning",actor:"BitcoinWalk",nextTitle:"BitcoinWalk is verifying the public services",nextDetail:preview.capabilities.detail,completed,total};
  if(!preview.payout.configured)return {mode:"resume",title:"Resume Pro setup",badge:"In progress",actor:"You",nextTitle:"Confirm the payout destination",nextDetail:"Add the private destination that receives 79% of city payments. Nothing becomes active until verification succeeds.",target:"payout",completed,total};
  if(!preview.signer.configured)return {mode:"resume",title:"Resume Pro setup",badge:"In progress",actor:"You",nextTitle:"Connect the city identity",nextDetail:"Reuse the existing verified city identity when available, or connect a recoverable dedicated signer.",target:"signer",completed,total};
  return {mode:"resume",title:"Resume Pro setup",badge:"Ready to submit",actor:"You",nextTitle:"Sign the private activation request",nextDetail:"Reconnect the saved city identity, then sign once for the host and once for the city. The request can safely be resumed if signing is cancelled.",target:"signer",completed,total};
}

function ShieldIcon(){return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
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
export function ProCitySetup({enabled,cityId,active=true}:{enabled:boolean;cityId:string;active?:boolean}){
  const {pubkey,cities}=useDashboard();
  useEffect(()=>{if(window.location.hash!=="#pro-city-services")return;const frame=requestAnimationFrame(()=>document.getElementById("pro-city-services")?.scrollIntoView({block:"start"}));return()=>cancelAnimationFrame(frame);},[cityId]);
  return <ProSetupForm key={`${pubkey}:${cityId}`} enabled={enabled} actor={pubkey} cities={cities} fixedCityId={cityId} embedded interactive={active}/>;
}
function ProSetupForm({enabled, actor, cities, fixedCityId="", embedded=false,interactive=true}: {enabled: boolean; actor: string; cities: Array<{id: string; name: string}>;fixedCityId?:string;embedded?:boolean;interactive?:boolean}) {
  const [cityId, setCityId] = useState(fixedCityId), [preview, setPreview] = useState<ProSetupPreview | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [destination, setDestination] = useState("");
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
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Pro setup could not be prepared.");
      setPreview(body.preview); setDestination(body.preview.payout.destination ?? body.preview.payout.suggestedDestination ?? "");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Preparation failed; no account or payment was changed.");}
    finally {inFlight.current = false; setBusy(false);}
  },[actor,cityId,embedded]);
  async function savePayout() {
    if (!preview || !destination.trim() || !actor || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const command = {action: "save-payout" as const, cityId: preview.cityId, destination: destination.trim()}, origin = window.location.origin;
      const event = await signWithBrowserExtension(proSetupTemplate(command, origin));
      if (event.pubkey !== actor || JSON.stringify(authorizeProSetup(event, origin)) !== JSON.stringify(command)) throw new Error("Your signer changed the payout request. Reconnect and try again.");
      const response = await fetch("/api/pro-setup", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({event}), signal: AbortSignal.timeout(60_000)});
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Payout destination could not be saved.");
      setPreview(value => value ? {...value, payout: {configured: true, destination: body.payout.destination, version: body.payout.version},
        steps: value.steps.map(step => step.label === "Personal payout destination" ? {...step, state: "ready", detail: body.payout.update==="queued"?`Destination version ${body.payout.version} is being verified. The current destination remains active until it passes.`:`Owner-confirmed destination version ${body.payout.version} is saved privately. It is not active until provisioning is verified.`} : step)} : value);
      setDestination(body.payout.destination); setMessage(body.payout.message);
    } catch (error) {setMessage(error instanceof Error ? error.message : "Destination was not saved.");}
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
      const response=await fetch("/api/pro-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event}),signal:AbortSignal.timeout(60_000)}),body=await response.json();
      if(!response.ok)throw new Error(body.error||`${label} visibility could not be changed.`);
      setPreview(value=>value?{...value,community:body.community}:value);setMessage(body.community.message);
    }catch(error){setMessage(error instanceof Error?error.message:`${label} visibility was not changed.`);}
    finally{inFlight.current=false;setBusy(false);}
  }
  const journey=preview?proSetupJourney(preview):null,manage=journey?.mode==="manage";
  const showCommunity=!!preview&&(preview.community.walkieTalkieActive||preview.community.armadaActive);
  function continueTo(target:"payout"|"signer"){document.getElementById(`pro-${target}-${cityId}`)?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});}
  return <section className={styles.shell} id={embedded?"pro-city-services":undefined} aria-labelledby={embedded?"pro-city-services-heading":undefined}>
    <div className={styles.intro}>{embedded?<h2 id="pro-city-services-heading">Pro city services</h2>:<h1>Upgrade your city</h1>}
      <p>Your personal account remains your dashboard login. The city has a separate public identity, payout destination and services.</p>
    </div>
    {!enabled ? <p role="status">This setup is being prepared and is not available yet. Your Pro payment remains recorded; do not pay again.</p> : <>
      {!fixedCityId&&<CityFinder label="Your city" placeholder="Search your cities…" value={cityId} disabled={busy} items={cities}
        onChange={id => {setCityId(id); setPreview(null); setDestination(""); setMessage("");}}/>}
      {!embedded&&<button type="button" onClick={() => void prepare()} disabled={busy || !cityId || !actor}>{busy ? "Preparing…" : "Verify and preview Pro setup"}</button>}
      <p className={styles.privateCheck}><ShieldIcon/>{embedded?"This private status check is read-only and is never published to Nostr.":"Your signer confirms a private, read-only request. It is not published to Nostr."}</p>
      {message && <p className={styles.message} role="alert">{message}</p>}
      {embedded&&!preview&&interactive&&<button className={styles.retry} type="button" onClick={()=>void prepare()} disabled={busy||!cityId||!actor}>{busy?"Waiting for signer…":message?"Retry Pro services":"Verify and load Pro services"}</button>}
      {preview && <section aria-label="Prepared city profile">
        {journey&&<section className={styles.journey} aria-label="Pro setup progress">
          <div className={styles.journeyTop}><div><p className={styles.eyebrow}>{preview.cityName} Pro</p><h3>{journey.title}</h3><p>Every completed step is saved. You can leave and return without paying again or creating another identity.</p></div><span className={styles.state} data-tone={journey.mode}>{journey.badge}</span></div>
          <div className={styles.progress}><div className={styles.progressLabel}><span>Setup progress</span><span>{journey.completed} of {journey.total} complete</span></div><div className={styles.progressTrack} role="progressbar" aria-label="Pro setup completion" aria-valuemin={0} aria-valuemax={journey.total} aria-valuenow={journey.completed}><span style={{width:`${Math.round(journey.completed/journey.total*100)}%`}}/></div></div>
          <div className={styles.nextAction}><span className={styles.nextIcon}>{journey.mode==="manage"?"✓":journey.actor==="You"?"1":"…"}</span><span className={styles.nextCopy}><small>{journey.actor}&apos;s next step</small><strong>{journey.nextTitle}</strong><span>{journey.nextDetail}</span></span>{journey.target&&<button className={styles.nextButton} type="button" onClick={()=>continueTo(journey.target!)}>Continue setup</button>}</div>
        </section>}
        <details className={styles.disclosure}><summary>Public city identity <span>{preview.capabilities.overall==="active"?"Active":"Preview"}</span></summary><div className={styles.disclosureBody}>
        <h2>{preview.profile.display_name}</h2>
        <Image className={styles.banner} unoptimized src={preview.profile.banner} alt={`${preview.cityName} profile banner`} width={1500} height={500}/>
        <p><Image unoptimized src={preview.profile.picture} alt={`${preview.cityName} BitcoinWalk avatar`} width={128} height={128} style={{borderRadius: "50%"}}/></p>
        <p>Website: <a href={preview.profile.website}>{preview.profile.website}</a></p>
        {preview.profile.nip05 && <p>NIP-05: <strong>{preview.profile.nip05}</strong></p>}
        <section aria-label="City service status"><h3>City services</h3><p><strong>{preview.capabilities.overall}</strong> — {preview.capabilities.detail}</p>
          <ul><li>NIP-05: <strong>{preview.capabilities.nip05}</strong></li><li>Lightning address: <strong>{preview.capabilities.lightning}</strong></li></ul></section>
        </div></details>
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
        {journey&&(!preview.payout.configured||manage)&&<fieldset className={styles.section} id={`pro-payout-${cityId}`} disabled={busy}>
          <legend>Personal payout destination</legend>
          <label>Lightning address or LNURL-pay
            <input value={destination} onChange={event => setDestination(event.target.value)} placeholder="you@example.com or lnurl1…" autoComplete="off" spellCheck={false}/>
          </label>
          <p>79% of payments to your city’s BitcoinWalk Lightning address will go to this private destination. BitcoinWalk retains 21%. Saving validates the endpoint but sends no payment.</p>
          {!preview.payout.configured && preview.payout.suggestedDestination && <p><strong>Recovered from your Pro checkout:</strong> {preview.payout.suggestedDestination}. Confirm it below with the current city owner’s signer; checkout alone cannot activate it.</p>}
          {preview.payout.configured && <p>Saved destination version {preview.payout.version}: <strong>{preview.payout.destination}</strong>. If you replace it, the current destination stays active until the new version passes verification.</p>}
          <button type="button" onClick={() => void savePayout()} disabled={busy || !destination.trim()}>{busy ? "Validating…" : preview.payout.configured ? "Validate and save new version" : "Validate and save destination"}</button>
        </fieldset>}
        {journey&&(journey.target==="signer"||manage)&&<div className={styles.section} id={`pro-signer-${cityId}`}><CitySignerSetup cityId={preview.cityId} cityName={preview.cityName} actor={actor} saved={preview.signer} activation={preview.activation} profile={preview.profile}
          setupReady={preview.payout.configured&&preview.signer.configured} busy={busy}
          onSaved={(signer, note) => {setPreview(value => value ? {...value, signer,steps:value.steps.map(step=>step.label==="City signer"?{...step,state:signer.configured?"ready":"blocked",detail:signer.configured?`Expected city signer version ${signer.version} is confirmed privately. Its key remains outside BitcoinWalk.`:`Create or connect a recoverable city identity, or reuse the owner account when its public profile is already named BitcoinWalk in ${preview.cityName}.`}:step)} : value); setMessage(note);}}
          onActivation={(activation,note)=>{setPreview(value=>value?{...value,activation}:value);setMessage(note);}}/></div>}
        {journey&&<details className={styles.disclosure}><summary>Completed setup details <span>{journey.completed}</span></summary><div className={styles.disclosureBody}><ol className={styles.stepList}>{preview.steps.filter(step=>step.state==="ready").map(step=><li key={step.label}><b>✓</b><div><strong>{step.label}</strong><p>{step.detail}</p></div></li>)}</ol></div></details>}
        <p className={styles.safeReturn}>BitcoinWalk never stores the city private key or remote-signer connection. Saved payout and identity details remain private until reviewed activation succeeds.</p>
      </section>}
    </>}
  </section>;
}
