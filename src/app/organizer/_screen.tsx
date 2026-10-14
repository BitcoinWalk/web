"use client";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";

import dynamic from "next/dynamic";
import { compareEvents, type Event } from "nostr-tools";
import { useRef, useState, type FormEvent } from "react";
import type { LocationValue } from "../../components/location-picker";
import { relayConfig } from "../../lib/relay-config";
import { createCityUpdateEvent } from "../../nostr/city-event";
import { queryCalendarEvents, queryDirectoryRecords, type ApprovalRecord, type AuthorizationRecord, type CityRevision } from "../../nostr/city-records";
import { queryAuthorizations } from "../../nostr/city-records";
import { archivedCityIds } from "../../nostr/moderation";
import { correctableRejectedCityRevisions, editableCityRevisions, editedCity } from "../../nostr/organizer-edit";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../nostr/signer";
import { publishVerifiedEvent } from "../../nostr/relay";
import {importCityImageURL} from "../../lib/media-client";
import {cityAliases} from "../../domain/city";
import {organizerDirectorySnapshot} from "../../nostr/dashboard-snapshot";
import {organizerCityInventory,type OrganizerCityInventoryItem} from "../../domain/organizer-city-inventory";
import {paymentFetch,signPayment,type LogoPackView} from "../../components/city-payment";
import {createInitialCalendarProposal} from "../../nostr/calendar-event";
import {calendarRoute} from "../../nostr/calendar-records";

const LocationPicker = dynamic(() => import("../../components/location-picker"), {ssr:false});
function exactTag(event:Event,name:string){const tags=event.tags.filter(tag=>tag[0]===name&&tag.length===2);return tags.length===1?tags[0][1]:"";}

export default function OrganizerPage() {
  const lock = useRef(false);
  const [busy,setBusy] = useState(false);
  const [identity,setIdentity] = useState("");
  const [cities,setCities] = useState<OrganizerCityInventoryItem[]>([]);
  const [logoPacks,setLogoPacks]=useState<LogoPackView[]>([]);
  const [proCityIds,setProCityIds]=useState<Set<string>>(new Set());
  const [decisions,setDecisions] = useState<ApprovalRecord[]>([]);
  const [base,setBase] = useState<CityRevision|null>(null);
  const [pin,setPin] = useState<LocationValue|null>(null);
  const [message,setMessage] = useState("Connect your host account to load cities you can edit.");
  const [submitted,setSubmitted] = useState(false);
  const [submittedImageUrl,setSubmittedImageUrl]=useState("");

  function select(revision: CityRevision|null) {
    setBase(revision); setPin(revision?.city.meetingPoint ?? null); setSubmitted(false);setSubmittedImageUrl("");
  }

  const dashboard=useDashboard();
  useDashboardAutoLoad(load);
  async function load() {
    if(lock.current) return;
    if (base && !submitted && !window.confirm("Reloading discards any unsent form changes. Continue?")) return;
    lock.current=true;setBusy(true);select(null);setCities([]);setProCityIds(new Set());setIdentity("");
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
      const preferred=available.find(item=>item.revision.city.cityId===dashboard.selectedCity);
      if(preferred)select(preferred.revision);
      else if(available.length===1)select(available[0].revision);
      setIdentity(key);setCities(available);setDecisions([...approvals].sort((a,b)=>compareEvents(a.event,b.event)));
      setLogoPacks(logoResult?.logoPacks??[]);
      setProCityIds(new Set((logoResult?.payments??[]).filter(payment=>payment.tier==="paid").map(payment=>payment.cityId)));
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
      const requestedImage=String(form.get("heroImageUrl")).trim();
      let heroImageUrl=base.city.heroImageUrl;
      if(requestedImage&&requestedImage!==base.city.heroImageUrl){setMessage("Approve importing the new city-template image into protected BitcoinWalk storage…");heroImageUrl=(await importCityImageURL(base.city.cityId,requestedImage)).url;}
      else if(!requestedImage)heroImageUrl=undefined;
      const aliases=cityAliases(String(form.get("aliases")),base.city.cityName);
      if(aliases.length>20)throw new Error("Use no more than 20 alternative city names.");
      const candidate=editedCity(base.city,{startAt:base.city.startAt,description:String(form.get("description")),meetingPoint:{...pin,description:String(form.get("meetingDescription"))},heroImageUrl,aliases:aliases.length?aliases:undefined});
      const key=await getBrowserExtensionPubkey();
      if(key!==identity) throw new Error("Signer account changed. Connect and load your walks again before editing.");
      setMessage("Checking current permission and revision…");
      const [grants,{revisions,approvals}]=await Promise.all([queryAuthorizations(relayConfig.writeRelays),queryDirectoryRecords(relayConfig.writeRelays)]);
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
    {key:"needs-changes",label:"Needs changes",items:cities.filter(item=>item.status==="needs-changes")},
    {key:"rejected",label:"Rejected",items:cities.filter(item=>item.status==="rejected")},
  ].filter(group=>group.items.length);
  const archivedCities=cities.filter(item=>item.status==="archived");
  const selectedCity=base?cities.find(item=>item.revision.city.cityId===base.city.cityId):undefined;
  const selectedLogo=base?logoPacks.find(pack=>pack.cityId===base.city.cityId&&pack.revisionId===base.event.id&&pack.ready&&pack.publiclyListed):undefined;
  function chooseCity(cityId:string){
    const next=cities.find(item=>item.revision.city.cityId===cityId)?.revision??null;
    if(base&&!submitted&&(selectedCity?.editable||selectedCity?.correctable)&&base.city.cityId!==next?.city.cityId&&!window.confirm("Switching cities discards unsent changes. Continue?"))return false;
    select(next);return true;
  }
  return <section>
    <button type="button" disabled={busy} onClick={load}>{busy?"Loading cities…":"Refresh cities"}</button>
    {message&&<p role="status" aria-live="polite">{message}</p>}
    {!!activeCities.length&&<div className="organizer-city-active" aria-labelledby="organizer-cities-active"><h3 id="organizer-cities-active">Active</h3><div className="organizer-city-list">{activeCities.map(item=><button key={item.revision.city.cityId} type="button" disabled={busy} aria-pressed={base?.city.cityId===item.revision.city.cityId} onClick={()=>chooseCity(item.revision.city.cityId)}><strong>{item.revision.city.cityName}</strong><span>/{item.revision.city.slug}</span></button>)}</div></div>}
    {!!cityGroups.length&&<div className="organizer-city-groups">{cityGroups.map(group=><section key={group.key} aria-labelledby={`organizer-cities-${group.key}`}>
      <h3 id={`organizer-cities-${group.key}`}>{group.label}</h3>
      <div className="organizer-city-list">{group.items.map(item=><button key={item.revision.city.cityId} type="button" disabled={busy} aria-pressed={base?.city.cityId===item.revision.city.cityId} onClick={()=>chooseCity(item.revision.city.cityId)}><strong>{item.revision.city.cityName}</strong><span>/{item.revision.city.slug}</span></button>)}</div>
    </section>)}</div>}
    {!!archivedCities.length&&<details className="organizer-city-archive"><summary><strong>Archived ({archivedCities.length})</strong></summary><div className="organizer-city-list">{archivedCities.map(item=><button key={item.revision.city.cityId} type="button" disabled={busy} aria-pressed={base?.city.cityId===item.revision.city.cityId} onClick={()=>chooseCity(item.revision.city.cityId)}><strong>{item.revision.city.cityName}</strong><span>/{item.revision.city.slug}</span></button>)}</div></details>}
    {base && selectedCity&&!selectedCity.editable&&!selectedCity.correctable&&<section><h3>{base.city.cityName} — {selectedCity.status==="archived"?"Archived":selectedCity.status==="rejected"?"Rejected":selectedCity.status==="needs-changes"?"Needs changes":"Pending approval"}</h3><p>{selectedCity.status==="archived"?"This city is read-only and hidden from public and active host views. Contact BitcoinWalk to request restoration.":selectedCity.status==="rejected"?"This application was declined and cannot be resubmitted as a correction. Contact BitcoinWalk if the circumstances have materially changed.":selectedCity.status==="needs-changes"?"This request cannot be corrected by the connected account. The original host or a super-admin must act.":"This request is awaiting super-admin review. It cannot be changed while that review is pending."}</p></section>}
    {base && selectedCity?.correctable&&<section aria-labelledby="correction-heading"><h2 id="correction-heading">Correct and resubmit {base.city.cityName}</h2><p><strong>Reviewer feedback:</strong> {selectedCity.reviewNote?.trim()||"No specific reason was provided. Review the submitted details carefully before resubmitting."}</p><p>Update the fields below, then submit a replacement for review. Your original signed walk references are preserved automatically.</p></section>}
    {base && (selectedCity?.editable||selectedCity?.correctable) && <section>
      <h2>{selectedCity.correctable?"City correction":"City profile"}</h2>
      <p>{selectedCity.correctable?"Only this rejected request can be replaced. It remains inactive until the super-admin approves the corrected revision.":"Edit the city description, hero image and default meeting point. Scheduled walks are managed separately in Walks. Pending edits are publicly readable; do not include private details."}</p>
      <p>City ID: {base.city.cityId}<br/>Editing revision: {base.event.id}<br/>Revision status: {submitted ? "New edit submitted" : status}</p>
      {selectedCity.editable&&<p><a href={`/${encodeURIComponent(base.city.slug)}`} target="_blank" rel="noreferrer">Open approved public page</a> (only available if an approved revision is published).</p>}
      {proCityIds.has(base.city.cityId)&&<section aria-label="Pro city setup"><h3>Pro city setup</h3><p>Your payment is recorded. Complete or resume the city identity, payout and public profile setup without paying again.</p><p><a className="chat-button" href={`/admin/upgrade?city=${encodeURIComponent(base.city.cityId)}`}>Complete Pro setup</a></p></section>}
      {selectedLogo?.href&&<p><a href={selectedLogo.href} target="_blank" rel="noreferrer">Download your Pro city logo pack</a></p>}
      <form key={base.event.id} onSubmit={submit}>
        <fieldset disabled={busy || submitted}>
          <legend>Walk details</legend>
          <LocationPicker cityName={base.city.cityName} onCityNameChange={()=>{}} cityLocked value={pin} onChange={value=>{if(!lock.current&&!submitted)setPin(value);}} />
          <label>Alternative city names <textarea name="aliases" defaultValue={(base.city.aliases??[]).join("\n")} maxLength={2020} placeholder={base.city.cityName==="Warszawa"?"Warsaw\nWarschau\nVarsovia":"One name per line"} /></label>
          <p>Optional. Add localized, translated or conventional spellings—one per line. These improve directory search but do not change the displayed city name or URL.</p>
          <label>Walk description <textarea name="description" defaultValue={base.city.description} maxLength={5000} required /></label>
          <label>Meeting-point description <input name="meetingDescription" defaultValue={base.city.meetingPoint.description} maxLength={500} required /></label>
          <label>Default city landscape image URL <input name="heroImageUrl" type="url" defaultValue={base.city.heroImageUrl??""} /></label>
          <p>Future walks inherit this image unless their organizer chooses a walk-specific override. A replacement is imported into BitcoinWalk storage and becomes public only after super-admin approval.</p>
          <p>The city URL, chat configuration and sponsor are preserved. This form does not change editor permissions.</p>
          <button type="submit">{submitted?"Submitted":busy?"Submitting…":selectedCity.correctable?"Submit correction for review":"Submit edit for approval"}</button>
        </fieldset>
      </form>
      {submitted&&<section aria-live="polite"><h3>Submitted city image</h3>{submittedImageUrl?<img className="hero-image" src={submittedImageUrl} alt={`Pending landscape for BitcoinWalk ${base.city.cityName}`} referrerPolicy="no-referrer"/>:<p>The submitted revision removes the city template image.</p>}<p>This is the safely stored image in the pending revision. The public city template and inherited walk images will change only after super-admin approval.</p></section>}
    </section>}
  </section>;
}
