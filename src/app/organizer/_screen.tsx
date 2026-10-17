"use client";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { compareEvents, type Event } from "nostr-tools";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { LocationValue } from "../../components/location-picker";
import { relayConfig } from "../../lib/relay-config";
import { createCityUpdateEvent } from "../../nostr/city-event";
import { queryCalendarEvents, queryDirectoryRecords, type ApprovalRecord, type AuthorizationRecord, type CityRevision } from "../../nostr/city-records";
import { queryAuthorizations } from "../../nostr/city-records";
import { archivedCityIds, deletedCityIds } from "../../nostr/moderation";
import { correctableRejectedCityRevisions, editableCityRevisions, editedCity } from "../../nostr/organizer-edit";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../nostr/signer";
import { publishVerifiedEvent } from "../../nostr/relay";
import {importCityImageURL,isManagedImageURL,uploadCityImage} from "../../lib/media-client";
import {cityAliases} from "../../domain/city";
import {organizerDirectorySnapshot} from "../../nostr/dashboard-snapshot";
import {organizerCityInventory,type OrganizerCityInventoryItem} from "../../domain/organizer-city-inventory";
import {paymentFetch,signPayment,type LogoPackView} from "../../components/city-payment";
import {createInitialCalendarProposal} from "../../nostr/calendar-event";
import {calendarRoute} from "../../nostr/calendar-records";
import {ProCitySetup} from "../admin/pro-setup/screen";
import {CityIdentityHealthDetails} from "../../components/city-identity-health";
import type {CityIdentityHealth} from "../../server/pro-city-identity-health";
import styles from "./my-cities.module.css";

const LocationPicker = dynamic(() => import("../../components/location-picker"), {ssr:false});
function exactTag(event:Event,name:string){const tags=event.tags.filter(tag=>tag[0]===name&&tag.length===2);return tags.length===1?tags[0][1]:"";}
type WorkspaceTab="profile"|"pro";
const stateLabel=(status:OrganizerCityInventoryItem["status"])=>status==="editable"||status==="approved"?"Active":status==="awaiting-approval"?"Pending":status==="needs-changes"?"Needs changes":status==="archived"?"Archived":"Rejected";
function Icon({children}: {children:ReactNode}){return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;}

export default function OrganizerPage() {
  const lock = useRef(false);
  const [busy,setBusy] = useState(false);
  const [identity,setIdentity] = useState("");
  const [cities,setCities] = useState<OrganizerCityInventoryItem[]>([]);
  const [logoPacks,setLogoPacks]=useState<LogoPackView[]>([]);
  const [proCityIds,setProCityIds]=useState<Set<string>>(new Set());
  const [identityHealth,setIdentityHealth]=useState<CityIdentityHealth[]>([]);
  const [decisions,setDecisions] = useState<ApprovalRecord[]>([]);
  const [base,setBase] = useState<CityRevision|null>(null);
  const [pin,setPin] = useState<LocationValue|null>(null);
  const [message,setMessage] = useState("Connect your host account to load cities you can edit.");
  const [submitted,setSubmitted] = useState(false);
  const [submittedImageUrl,setSubmittedImageUrl]=useState("");
  const [heroImageInput,setHeroImageInput]=useState("");
  const [imageUploading,setImageUploading]=useState(false);
  const [workspaceTab,setWorkspaceTab]=useState<WorkspaceTab>("profile");

  useEffect(()=>{if(window.location.hash!=="#pro-city-services")return;let active=true;queueMicrotask(()=>{if(active)setWorkspaceTab("pro");});return()=>{active=false;};},[]);

  function select(revision: CityRevision|null) {
    setBase(revision); setPin(revision?.city.meetingPoint ?? null); setSubmitted(false);setSubmittedImageUrl("");setHeroImageInput(revision?.city.heroImageUrl??"");
  }

  async function uploadHero(file:File){
    if(!base||imageUploading||busy)return;setImageUploading(true);setMessage("Approve the city hero upload in your signer…");
    try{const result=await uploadCityImage(base.city.cityId,file);if(await getBrowserExtensionPubkey()!==identity)throw new Error("Signer identity changed. Reconnect before submitting.");setHeroImageInput(result.url);setMessage("City hero uploaded and ready. Submit the city profile to send it for approval.");}
    catch(error){setMessage(error instanceof Error?error.message:"Could not upload the city hero.");}
    finally{setImageUploading(false);}
  }

  const dashboard=useDashboard();
  useDashboardAutoLoad(load);
  async function load() {
    if(lock.current) return;
    if (base && !submitted && !window.confirm("Reloading discards any unsent form changes. Continue?")) return;
    lock.current=true;setBusy(true);select(null);setCities([]);setProCityIds(new Set());setIdentityHealth([]);setIdentity("");
    try {
      if (!relayConfig.readRelays.length) throw new Error("No read relay configured.");
      const key=await getBrowserExtensionPubkey();
      let loaded:{grants:AuthorizationRecord[];revisions:CityRevision[];approvals:ApprovalRecord[]};
      const snapshot=organizerDirectorySnapshot(dashboard,key);
      const logoResult=await signPayment({action:"list"},key).then(paymentFetch).catch(()=>null);
      if(snapshot)loaded=snapshot;
      else {const [grants,directory]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryDirectoryRecords(relayConfig.readRelays)]);loaded={grants,...directory};}
      const {grants,revisions,approvals}=loaded;
      if(await getBrowserExtensionPubkey()!==key) throw new Error("Signer account changed. Reconnect with the intended account.");
      const available=organizerCityInventory(key,grants,revisions,approvals);
      const requestedCity=new URLSearchParams(window.location.search).get("city")??dashboard.selectedCity;
      const preferred=available.find(item=>item.revision.city.cityId===requestedCity);
      if(preferred)select(preferred.revision);
      else if(available.length===1)select(available[0].revision);
      setIdentity(key);setCities(available);setDecisions([...approvals].sort((a,b)=>compareEvents(a.event,b.event)));
      setLogoPacks(logoResult?.logoPacks??[]);
      setProCityIds(new Set(logoResult?.proCityIds??(logoResult?.payments??[]).filter(payment=>payment.tier==="paid").map(payment=>payment.cityId)));
      setIdentityHealth(logoResult?.identityHealth??[]);
      setMessage(available.length ? "" : "No cities were returned for this identity. Check your signer account and relay connection.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not load walks.");}
    finally {lock.current=false;setBusy(false);}
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(lock.current || !base || !pin || submitted) return;
    const form = new FormData(event.currentTarget),correcting=selectedCity?.correctable===true;
    lock.current=true;setBusy(true);
    setMessage("Preparing your city changes…");
    try {
      if (!relayConfig.writeRelays.length) throw new Error("No write relay configured.");
      const requestedImage=heroImageInput.trim();
      let heroImageUrl=base.city.heroImageUrl;
      if(requestedImage&&requestedImage!==base.city.heroImageUrl){if(isManagedImageURL(requestedImage))heroImageUrl=requestedImage;else{setMessage("Approve importing the new city-template image into protected BitcoinWalk storage…");heroImageUrl=(await importCityImageURL(base.city.cityId,requestedImage)).url;}}
      else if(!requestedImage)heroImageUrl=undefined;
      const aliases=cityAliases(String(form.get("aliases")),base.city.cityName);
      if(aliases.length>20)throw new Error("Use no more than 20 alternative city names.");
      const candidate=editedCity(base.city,{startAt:base.city.startAt,description:String(form.get("description")),meetingPoint:{...pin,description:String(form.get("meetingDescription"))},heroImageUrl,aliases:aliases.length?aliases:undefined});
      const key=await getBrowserExtensionPubkey();
      if(key!==identity) throw new Error("Signer account changed. Connect and load your walks again before editing.");
      setMessage("Checking current permission and revision…");
      const [grants,{revisions,approvals}]=await Promise.all([queryAuthorizations(relayConfig.writeRelays),queryDirectoryRecords(relayConfig.writeRelays)]);
      if(deletedCityIds(approvals).has(base.city.cityId)) {setCities(items=>items.filter(item=>item.revision.city.cityId!==base.city.cityId));select(null);throw new Error("This city has been deleted from BitcoinWalk. Nothing was signed.");}
      if(archivedCityIds(approvals).has(base.city.cityId)) {setCities(items=>items.filter(item=>item.revision.city.cityId!==base.city.cityId));select(null);throw new Error("This city has been archived and removed from your editable walks. An admin must restore it first. Nothing was signed.");}
      const current=(correcting?correctableRejectedCityRevisions(key,grants,revisions,approvals):editableCityRevisions(key,grants,revisions,approvals)).find(r=>r.city.cityId===base.city.cityId);
      if(!current) throw new Error(correcting?"This correction is no longer available. Reload Cities to see who must act next; nothing was signed.":"Could not confirm your current editor permission. Reload your walks; nothing was signed.");
      if(current.event.id!==base.event.id) throw new Error("A newer revision is available. Copy your unsent changes, then reload before submitting.");
      const priorInitialIds=correcting?base.event.tags.filter(tag=>tag[0]==="e"&&tag[3]==="initial-walk").map(tag=>tag[1]):[];
      const replacementWalks:Event[]=[];
      if(correcting&&priorInitialIds.length){
        setMessage("Loading the original signed walks so corrected replacements can match this city…");
        const originals=await queryCalendarEvents(relayConfig.writeRelays,{ids:priorInitialIds});
        for(const id of priorInitialIds){
          const original=originals.find(event=>event.id===id&&event.pubkey===key),zone=original?exactTag(original,"start_tzid"):"",start=original?Number(exactTag(original,"start")):NaN;
          if(!original||!zone||!Number.isSafeInteger(start))throw new Error("The original signed walk could not be verified. Nothing new was signed; ask the super-admin to review the retained request.");
          setMessage(`Approve corrected walk ${replacementWalks.length+1} of ${priorInitialIds.length}…`);
          const replacement=await signWithBrowserExtension(createInitialCalendarProposal(candidate,zone,calendarRoute(original)??"",new Date(start*1000).toISOString()));
          if(replacement.pubkey!==key)throw new Error("Signer identity changed; corrected walks were not published.");
          replacementWalks.push(replacement);
        }
      }
      setMessage("Approve the corrected city signature and relay authentication in your extension…");
      const initialEventIds=replacementWalks.length?replacementWalks.map(walk=>walk.id):priorInitialIds;
      const signed=await signWithBrowserExtension(createCityUpdateEvent(candidate,base.event.id,initialEventIds.length?initialEventIds:undefined));
      if(signed.pubkey!==key || await getBrowserExtensionPubkey()!==key) throw new Error("Signer identity changed; revision was not published.");
      const afterSigning=await queryDirectoryRecords(relayConfig.writeRelays);
      if(deletedCityIds(afterSigning.approvals).has(base.city.cityId)) {setCities(items=>items.filter(item=>item.revision.city.cityId!==base.city.cityId));select(null);throw new Error("This city was deleted while signing. The edit was not published.");}
      if(archivedCityIds(afterSigning.approvals).has(base.city.cityId)) {setCities(items=>items.filter(item=>item.revision.city.cityId!==base.city.cityId));select(null);throw new Error("This city was archived while signing. The edit was not published.");}
      if(correcting&&!correctableRejectedCityRevisions(key,grants,afterSigning.revisions,afterSigning.approvals).some(revision=>revision.event.id===base.event.id))throw new Error("The review state changed while you were signing. Nothing was published; reload Cities.");
      for(const walk of replacementWalks)await publishVerifiedEvent(walk,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      const publication=await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      setSubmittedImageUrl(heroImageUrl??"");
      setSubmitted(true);
      setMessage(`${correcting?"Correction":"Revision"} ${signed.id} submitted to ${publication.accepted.length} relay(s), awaiting super-admin review. ${correcting?"The rejected revision remains in signed history, and this replacement is now pending.":"This does not change the public walk."} Reload to edit again.`);
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not submit the revision.");}
    finally {lock.current=false;setBusy(false);}
  }

  const status=base ? decisions.find(r=>r.approval.cityRevisionId===base.event.id)?.approval.status ?? "pending / no decision returned" : "";
  const activeCities=cities.filter(item=>item.status==="editable"||item.status==="approved");
  const cityGroups=[
    {key:"pending",label:"Pending",items:cities.filter(item=>item.status==="awaiting-approval")},
    {key:"needs-changes",label:"Awaits change",items:cities.filter(item=>item.status==="needs-changes")},
    {key:"rejected",label:"Rejected",items:cities.filter(item=>item.status==="rejected")},
  ].filter(group=>group.items.length);
  const archivedCities=cities.filter(item=>item.status==="archived");
  const selectedCity=base?cities.find(item=>item.revision.city.cityId===base.city.cityId):undefined;
  const selectedLogo=base?logoPacks.find(pack=>pack.cityId===base.city.cityId&&pack.revisionId===base.event.id&&pack.ready&&pack.publiclyListed):undefined;
  function chooseCity(cityId:string){
    const next=cities.find(item=>item.revision.city.cityId===cityId)?.revision??null;
    if(base&&!submitted&&(selectedCity?.editable||selectedCity?.correctable)&&base.city.cityId!==next?.city.cityId&&!window.confirm("Switching cities discards unsent changes. Continue?"))return false;
    select(next);setWorkspaceTab("profile");return true;
  }
  const cityButton=(item:OrganizerCityInventoryItem)=><button className={styles.cityButton} key={item.revision.city.cityId} type="button" disabled={busy} aria-pressed={base?.city.cityId===item.revision.city.cityId} onClick={()=>chooseCity(item.revision.city.cityId)}>
    <span className={styles.cityButtonIcon}>{item.revision.city.cityName.slice(0,1).toUpperCase()}</span><span className={styles.cityButtonCopy}><strong>{item.revision.city.cityName}</strong><small>/{item.revision.city.slug}</small></span><span className={styles.cityButtonState} data-state={item.status}>{stateLabel(item.status)}</span>
  </button>;
  return <main className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>City management</p><h1>My cities</h1><p>Manage your public city profile and Pro services from one place.</p></div><button className={styles.refreshButton} type="button" disabled={busy} onClick={load}><Icon><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></Icon>{busy?"Refreshing…":"Refresh"}</button></header>
    {message&&<p className={styles.notice} data-error={message.toLowerCase().includes("could not")||undefined} role="status" aria-live="polite">{message}</p>}
    <div className={styles.workspace}>
      <aside className={styles.cityRail} aria-label="Your cities">
        <div className={styles.railHeader}><h2>Cities</h2><span>{cities.length}</span></div>
        {!!activeCities.length&&<section className={styles.cityGroup} aria-labelledby="organizer-cities-active"><h3 id="organizer-cities-active">Active</h3><div className={styles.cityList}>{activeCities.map(cityButton)}</div></section>}
        {cityGroups.map(group=><section className={styles.cityGroup} key={group.key} aria-labelledby={`organizer-cities-${group.key}`}><h3 id={`organizer-cities-${group.key}`}>{group.label}</h3><div className={styles.cityList}>{group.items.map(cityButton)}</div></section>)}
        {!!archivedCities.length&&<details className={styles.archive}><summary><span>Archived</span><span>{archivedCities.length}</span></summary><div className={styles.cityList}>{archivedCities.map(cityButton)}</div></details>}
        {!cities.length&&!busy&&<div className={styles.railEmpty}><p>No cities found for this account.</p><small>Check the connected signer, then refresh.</small></div>}
      </aside>
      <section className={styles.cityWorkspace}>
        {!base||!selectedCity?<div className={styles.emptyState}><span className={styles.emptyIcon}><Icon><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-8h6v8"/></Icon></span><h2>Select a city</h2><p>Choose a city to manage its profile and services.</p></div>:<>
          <header className={styles.cityHeader}><div className={styles.cityIdentity}><span className={styles.cityAvatar}>{base.city.cityName.slice(0,1).toUpperCase()}</span><div><div className={styles.cityTitleRow}><h2>{base.city.cityName}</h2><span className={styles.statusBadge} data-state={selectedCity.status}>{stateLabel(selectedCity.status)}</span>{proCityIds.has(base.city.cityId)&&<span className={styles.proBadge}>Pro</span>}</div><p>bitcoinwalk.org/{base.city.slug}</p></div></div><div className={styles.headerActions}>{selectedCity.editable&&<a className={styles.secondaryAction} href={`/${encodeURIComponent(base.city.slug)}`} target="_blank" rel="noreferrer">View public page <Icon><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7H3V3h7"/></Icon></a>}{selectedLogo?.href&&<a className={styles.secondaryAction} href={selectedLogo.href} target="_blank" rel="noreferrer">Logo pack</a>}</div></header>
          {selectedCity&&!selectedCity.editable&&!selectedCity.correctable?<div className={styles.statePanel}><span className={styles.stateIcon}>!</span><div><h3>{stateLabel(selectedCity.status)}</h3><p>{selectedCity.status==="archived"?"This city is read-only and hidden from public and active host views. Contact BitcoinWalk to request restoration.":selectedCity.status==="rejected"?"This application was declined and cannot be resubmitted as a correction. Contact BitcoinWalk if the circumstances have materially changed.":selectedCity.status==="needs-changes"?"This request is waiting for the original host to make the requested correction. A super-admin cannot replace that host's signed submission.":"This request is awaiting super-admin review. It cannot be changed while that review is pending."}</p></div></div>:<>
            {selectedCity.correctable&&<div className={styles.reviewPanel} aria-labelledby="correction-heading"><p className={styles.eyebrow}>Reviewer feedback</p><h3 id="correction-heading">Correct and resubmit {base.city.cityName}</h3><p>{selectedCity.reviewNote?.trim()||"No specific reason was provided. Review the submitted details carefully before resubmitting."}</p><small>Update the fields below, then submit a replacement. The original signed walks remain in history.</small></div>}
            <nav className={styles.tabs} aria-label="City settings"><button type="button" aria-current={workspaceTab==="profile"?"page":undefined} onClick={()=>setWorkspaceTab("profile")}><Icon><path d="M4 21v-7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7"/><circle cx="12" cy="4" r="3"/></Icon>Profile</button>{proCityIds.has(base.city.cityId)&&<button type="button" aria-current={workspaceTab==="pro"?"page":undefined} onClick={()=>setWorkspaceTab("pro")}><Icon><path d="m12 3 2.2 4.5 4.9.7-3.6 3.5.9 4.9-4.4-2.3-4.4 2.3.9-4.9-3.6-3.5 4.9-.7z"/></Icon>Pro services</button>}</nav>
            {proCityIds.has(base.city.cityId)&&<div className={styles.proPanel} hidden={workspaceTab!=="pro"}>{dashboard.role==="super-admin"?<CityIdentityHealthDetails row={identityHealth.find(row=>row.cityId===base.city.cityId)} onRecheck={load}/>:<ProCitySetup enabled cityId={base.city.cityId} active={workspaceTab==="pro"}/>}</div>}
            <section className={styles.profilePanel} aria-labelledby="city-profile-heading" hidden={workspaceTab!=="profile"}>
              <div className={styles.panelHeading}><div><p className={styles.eyebrow}>{selectedCity.correctable?"Correction":"Public information"}</p><h3 id="city-profile-heading">{selectedCity.correctable?"City correction":"City profile"}</h3><p>{selectedCity.correctable?"Only this replacement can be reviewed. It stays private until approved.":"Edit the description, hero image and default meeting point shown across your city and walks."}</p></div></div>
              <form className={styles.editorForm} key={base.event.id} onSubmit={submit}>
                <fieldset disabled={busy || submitted || imageUploading}>
                  <div className={styles.formSection}><div className={styles.formSectionHeading}><span>1</span><div><h4>About the city</h4><p>Give visitors a clear reason to join your BitcoinWalk.</p></div></div><label>City description<textarea name="description" defaultValue={base.city.description} maxLength={5000} required/></label></div>
                  <div className={styles.formSection}><div className={styles.formSectionHeading}><span>2</span><div><h4>Meeting point</h4><p>Set the default location inherited by new walks.</p></div></div><LocationPicker cityName={base.city.cityName} onCityNameChange={()=>{}} cityLocked value={pin} onChange={value=>{if(!lock.current&&!submitted)setPin(value);}}/><label>Meeting-point description<input name="meetingDescription" defaultValue={base.city.meetingPoint.description} maxLength={500} required/></label></div>
                  <div className={styles.formSection}><div className={styles.formSectionHeading}><span>3</span><div><h4>City image</h4><p>This landscape becomes the default for future walks.</p></div></div>{heroImageInput&&<Image unoptimized className={styles.heroPreview} src={heroImageInput} alt={`Selected ${base.city.cityName} city landscape`} width={1200} height={525} referrerPolicy="no-referrer"/>}<label>Upload landscape image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void uploadHero(file);}}/></label>{imageUploading&&<p role="status">Uploading image…</p>}<p><strong>Or use an image URL</strong></p><label>Landscape image URL<input type="url" value={heroImageInput} onChange={event=>setHeroImageInput(event.target.value)} placeholder="https://…"/></label><small>Accepted files: JPEG, PNG or WebP up to 5 MB. The file is decoded, normalized and copied into protected BitcoinWalk storage. It changes publicly only after approval.</small></div>
                  <details className={styles.advanced}><summary>Alternative names and technical details</summary><div><label>Alternative city names<textarea name="aliases" defaultValue={(base.city.aliases??[]).join("\n")} maxLength={2020} placeholder={base.city.cityName==="Warszawa"?"Warsaw\nWarschau\nVarsovia":"One name per line"}/></label><p>Add localized or conventional spellings, one per line. They improve search without changing the public URL.</p><dl><div><dt>City ID</dt><dd><code>{base.city.cityId}</code></dd></div><div><dt>Revision</dt><dd><code>{base.event.id}</code></dd></div><div><dt>Status</dt><dd>{submitted?"New edit submitted":status}</dd></div></dl></div></details>
                  <div className={styles.formFooter}><p>Changes are signed by your connected account and sent for review. Walk schedules are managed separately in <Link href="/admin/walks">Walks</Link>.</p><button className={styles.primaryAction} type="submit">{submitted?"Submitted":busy?"Submitting…":selectedCity.correctable?"Submit correction":"Submit for approval"}</button></div>
                </fieldset>
              </form>
              {submitted&&<div className={styles.successPanel} aria-live="polite"><span>✓</span><div><h3>Changes submitted</h3>{submittedImageUrl?<Image unoptimized className={styles.heroPreview} src={submittedImageUrl} alt={`Pending landscape for BitcoinWalk ${base.city.cityName}`} width={1200} height={525} referrerPolicy="no-referrer"/>:<p>The submitted revision removes the city template image.</p>}<p>The public city remains unchanged until a super-admin approves this revision.</p></div></div>}
            </section>
          </>}
        </>}
      </section>
    </div>
  </main>;
}
