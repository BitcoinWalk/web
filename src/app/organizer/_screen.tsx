"use client";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";

import dynamic from "next/dynamic";
import { compareEvents } from "nostr-tools";
import { useRef, useState, type FormEvent } from "react";
import type { LocationValue } from "../../components/location-picker";
import { relayConfig } from "../../lib/relay-config";
import { showCityInPicker } from "../../domain/city-picker";
import { createCityUpdateEvent } from "../../nostr/city-event";
import { queryDirectoryRecords, type ApprovalRecord, type CityRevision } from "../../nostr/city-records";
import { queryAuthorizations } from "../../nostr/city-records";
import { archivedCityIds } from "../../nostr/moderation";
import { editableCityRevisions, editedCity } from "../../nostr/organizer-edit";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../nostr/signer";
import { publishVerifiedEvent } from "../../nostr/relay";

const LocationPicker = dynamic(() => import("../../components/location-picker"), {ssr:false});

export default function OrganizerPage() {
  const lock = useRef(false);
  const [busy,setBusy] = useState(false);
  const [identity,setIdentity] = useState("");
  const [cities,setCities] = useState<CityRevision[]>([]);
  const [decisions,setDecisions] = useState<ApprovalRecord[]>([]);
  const [base,setBase] = useState<CityRevision|null>(null);
  const [pin,setPin] = useState<LocationValue|null>(null);
  const [message,setMessage] = useState("Connect your organizer extension to load walks you can edit.");
  const [submitted,setSubmitted] = useState(false);

  function select(revision: CityRevision|null) {
    setBase(revision); setPin(revision?.city.meetingPoint ?? null); setSubmitted(false);
  }

  const dashboard=useDashboard();
  useDashboardAutoLoad(load);
  async function load() {
    if(lock.current) return;
    if (base && !submitted && !window.confirm("Reloading discards any unsent form changes. Continue?")) return;
    lock.current=true;setBusy(true);select(null);setCities([]);setIdentity("");
    try {
      if (!relayConfig.readRelays.length) throw new Error("No read relay configured.");
      const key=await getBrowserExtensionPubkey();
      const [grants,{revisions,approvals}]=await Promise.all([queryAuthorizations(relayConfig.readRelays),queryDirectoryRecords(relayConfig.readRelays)]);
      if(await getBrowserExtensionPubkey()!==key) throw new Error("Signer account changed. Reconnect with the intended account.");
      const available=editableCityRevisions(key,grants,revisions,approvals).filter(r=>!dashboard.selectedCity||r.city.cityId===dashboard.selectedCity);
      if(dashboard.selectedCity&&available.length)select(available[0]);
      setIdentity(key);setCities(available);setDecisions([...approvals].sort((a,b)=>compareEvents(a.event,b.event)));
      setMessage(available.length ? "Select a walk. The form starts from its latest available authorized revision, which may still be pending." : "No registered editable walks were returned. Check your signer account and relay connection; new cities must first be registered by the super-admin.");
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not load walks.");}
    finally {lock.current=false;setBusy(false);}
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(lock.current || !base || !pin || submitted) return;
    const form = new FormData(event.currentTarget);
    lock.current=true;setBusy(true);
    try {
      if (!relayConfig.writeRelays.length) throw new Error("No write relay configured.");
      const candidate=editedCity(base.city,{startAt:base.city.startAt,description:String(form.get("description")),meetingPoint:{...pin,description:String(form.get("meetingDescription"))},heroImageUrl:String(form.get("heroImageUrl"))});
      const key=await getBrowserExtensionPubkey();
      if(key!==identity) throw new Error("Signer account changed. Connect and load your walks again before editing.");
      setMessage("Checking current permission and revision…");
      const [grants,{revisions,approvals}]=await Promise.all([queryAuthorizations(relayConfig.writeRelays),queryDirectoryRecords(relayConfig.writeRelays)]);
      if(archivedCityIds(approvals).has(base.city.cityId)) {setCities(items=>items.filter(r=>r.city.cityId!==base.city.cityId));select(null);throw new Error("This city has been archived and removed from your editable walks. An admin must restore it first. Nothing was signed.");}
      const current=editableCityRevisions(key,grants,revisions,approvals).find(r=>r.city.cityId===base.city.cityId);
      if(!current) throw new Error("Could not confirm your current editor permission. Reload your walks; nothing was signed.");
      if(current.event.id!==base.event.id) throw new Error("A newer revision is available. Copy your unsent changes, then reload before submitting.");
      setMessage("Approve the revision signature and relay authentication in your extension…");
      const signed=await signWithBrowserExtension(createCityUpdateEvent(candidate,base.event.id));
      if(signed.pubkey!==key || await getBrowserExtensionPubkey()!==key) throw new Error("Signer identity changed; revision was not published.");
      const afterSigning=await queryDirectoryRecords(relayConfig.writeRelays);
      if(archivedCityIds(afterSigning.approvals).has(base.city.cityId)) {setCities(items=>items.filter(r=>r.city.cityId!==base.city.cityId));select(null);throw new Error("This city was archived while signing. The edit was not published.");}
      const publication=await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
      setSubmitted(true);
      setMessage(`Revision ${signed.id} submitted to ${publication.accepted.length} relay(s), awaiting super-admin approval. This does not change the public walk. Reload to edit again.`);
    } catch(error) {setMessage(error instanceof Error ? error.message : "Could not submit the revision.");}
    finally {lock.current=false;setBusy(false);}
  }

  const status=base ? decisions.find(r=>r.approval.cityRevisionId===base.event.id)?.approval.status ?? "pending / no decision returned" : "";
  return <section>
    <h2>City profile</h2>
    <p>Edit the city description, hero image and default meeting point. Scheduled walks are managed separately in Walks. Pending edits are publicly readable; do not include private details.</p>
    <button type="button" disabled={busy} onClick={load}>{busy?"Loading cities…":"Refresh cities"}</button>
    <p>Archived cities are hidden. A super-admin can restore them from the archived-city list.</p>
    {identity && <p>Connected public key: {identity}</p>}
    <p role="status" aria-live="polite">{message}</p>
    {!!cities.length && <label>Walk <select disabled={busy} value={base?.city.cityId ?? ""} onChange={e=>{
      if(base && !submitted && !window.confirm("Switching walks discards unsent changes. Continue?")) return;
      select(cities.find(r=>r.city.cityId===e.target.value) ?? null);
    }}><option value="">Select a walk</option>{cities.filter(r=>showCityInPicker(r.city.cityName)).map(r=><option key={r.city.cityId} value={r.city.cityId}>{r.city.cityName} — {r.city.cityId}</option>)}</select></label>}
    {base && <section>
      <p>City ID: {base.city.cityId}<br/>Editing revision: {base.event.id}<br/>Revision status: {submitted ? "New edit submitted" : status}</p>
      <p><a href={`/${encodeURIComponent(base.city.slug)}`} target="_blank" rel="noreferrer">Open approved public page</a> (only available if an approved revision is published).</p>
      <form key={base.event.id} onSubmit={submit}>
        <fieldset disabled={busy || submitted}>
          <legend>Walk details</legend>
          <LocationPicker cityName={base.city.cityName} onCityNameChange={()=>{}} cityLocked value={pin} onChange={value=>{if(!lock.current&&!submitted)setPin(value);}} />
          <label>Walk description <textarea name="description" defaultValue={base.city.description} maxLength={5000} required /></label>
          <label>Meeting-point description <input name="meetingDescription" defaultValue={base.city.meetingPoint.description} maxLength={500} required /></label>
          <label>Hero image URL <input name="heroImageUrl" type="url" defaultValue={base.city.heroImageUrl} required /></label>
          <p>The city URL, chat configuration and sponsor are preserved. This form does not change editor permissions.</p>
          <button type="submit">Submit edit for approval</button>
        </fieldset>
      </form>
    </section>}
  </section>;
}
