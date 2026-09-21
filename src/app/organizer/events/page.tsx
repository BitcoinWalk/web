"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { LocationValue } from "../../../components/location-picker";
import { withEventMeetingPoint, type LocatedOccurrence } from "../../../domain/event-location";
import { useRef, useState, type FormEvent } from "react";
import type { Event } from "nostr-tools";
import { DEFAULT_OCCURRENCES, DEFAULT_WEEKDAY, WEEKDAYS, scheduleOccurrences, type WalkSchedule } from "../../../domain/walk-schedule";
import { calendarNevent, loadCalendarWalks, type CalendarWalk } from "../../../nostr/calendar-records";
import { queryAuthorizations, queryCalendarEvents } from "../../../nostr/city-records";
import { canEditCity } from "../../../nostr/organizer-edit";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../../nostr/signer";
import { createOrganizerCalendarEvent } from "../../../nostr/calendar-event";
import { publishVerifiedEvent } from "../../../nostr/relay";
import { relayConfig } from "../../../lib/relay-config";
import { cityTimeZone } from "../../../domain/city-time";
import { readRecurringPlan, saveRecurringPlan, upcomingDrafts, type RecurringPlan } from "../../../domain/rolling-drafts";
import { eventPageHref, managedCalendarEvents } from "../../../domain/event-routing";
import { directoryConfig } from "../../../lib/directory-config";

const LocationPicker = dynamic(() => import("../../../components/location-picker"), { ssr: false });

export default function OrganizerEventsPage() {
  const [walks, setWalks] = useState<CalendarWalk[]>([]);
  const [publishedByCity, setPublishedByCity] = useState<Record<string, Event[]>>({});
  const [cityId, setCityId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [pastCities, setPastCities] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Connect your organizer identity to see your scheduled walks.");
  const [preview, setPreview] = useState<LocatedOccurrence[]>([]);
  const [meetingPoint, setMeetingPoint] = useState<LocationValue | null>(null);
  const [frequency, setFrequency] = useState<WalkSchedule["frequency"]>("weekly");
  const [weekday, setWeekday] = useState(DEFAULT_WEEKDAY);
  const [owner, setOwner] = useState("");
  const [plans, setPlans] = useState<Record<string, RecurringPlan>>({});
  const [firstDate, setFirstDate] = useState("");
  const [localTime, setLocalTime] = useState("10:00");
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, { status: "publishing" | "published" | "failed"; detail?: string; event?: Event }>>({});
  const signedRetries = useRef<Record<string, Event>>({});
  const seriesId = useRef("");
  const lock = useRef(false);
  const scheduleForm = useRef<HTMLFormElement>(null);

  async function load() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setWalks([]); setPublishedByCity({}); setCityId(""); setShowForm(false); setPastCities(new Set()); setPreview([]); setMeetingPoint(null); setOwner(""); setPlans({}); setReviewing(false); setSelected(new Set()); setResults({}); signedRetries.current={};
    try {
      const key = await getBrowserExtensionPubkey();
      const [approved, grants] = await Promise.all([loadCalendarWalks(relayConfig.readRelays), queryAuthorizations(relayConfig.readRelays)]);
      if (await getBrowserExtensionPubkey() !== key) throw new Error("Signer changed. Connect again.");
      const available = approved.filter(walk => {
        const latest = grants.find(record => record.grant.cityId === walk.revision.city.cityId);
        return latest && canEditCity(key, latest.grant);
      });
      const published: Record<string, Event[]> = {};
      for (const walk of available) {
        const id=walk.revision.city.cityId;
        published[id]=await queryCalendarEvents(relayConfig.readRelays,{cityId:id});
      }
      if (await getBrowserExtensionPubkey() !== key) throw new Error("Signer changed. Connect again.");
      setWalks(available);
      setPublishedByCity(published);
      setOwner(key);
      const saved: Record<string, RecurringPlan> = {};
      const problems: string[] = [];
      for (const walk of available) {
        try {
          const plan = readRecurringPlan(window.localStorage, key, walk.revision.city.cityId);
          if (plan) { saved[plan.cityId] = plan; upcomingDrafts(plan); }
        } catch { problems.push(walk.revision.city.cityName); }
      }
      setPlans(saved);
      setMessage((available.length ? "Scheduled walks loaded from the relay. Choose + Add a walk when you want to create another." : "No approved city with organizer permission was returned. Check your signer identity.") + (problems.length ? ` Saved drafts need attention for: ${problems.join(", ")}. They were not overwritten.` : ""));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load cities."); }
    finally { lock.current = false; setBusy(false); }
  }

  function review(plan: RecurringPlan) {
    try {
      const drafts = upcomingDrafts(plan);
      setShowForm(true);
      setCityId(plan.cityId); setMeetingPoint({ ...plan.meetingPoint }); setFrequency(plan.frequency);
      setWeekday(plan.weekday); setFirstDate(plan.firstDate); setLocalTime(plan.localTime); seriesId.current = plan.seriesId;
      setPreview(drafts); setSelected(new Set(drafts.map(d=>d.id))); setResults({}); setReviewing(true);
      setMessage(plan.paused ? "Recurring plan paused. Resume to replenish drafts." : `${drafts.length} upcoming drafts ready to review. Select only the walks you want to sign now.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not review saved plan."); }
  }

  function persist(plan: RecurringPlan) {
    const drafts = upcomingDrafts(plan);
    saveRecurringPlan(window.localStorage, plan);
    setPlans(previous => ({ ...previous, [plan.cityId]: plan }));
    setPreview(drafts); setSelected(new Set(drafts.map(d=>d.id))); setResults({}); setReviewing(true);
    setMessage(plan.paused ? "Plan paused in this browser. No published events were changed." : "Saved in this browser. Eight upcoming drafts are ready for explicit review and signing.");
  }

  function updateSaved(change: Partial<Pick<RecurringPlan, "paused" | "skippedDates">>) {
    try {
      const plan = readRecurringPlan(window.localStorage, owner, cityId);
      if (!plan) throw new Error("No saved plan found. Save your recurring plan first.");
      persist({ ...plan, ...change });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save plan."); }
  }

  function savePlan() {
    if (!scheduleForm.current?.reportValidity()) {
      setMessage("Please complete the required date, start time and meeting-point description before saving.");
      return;
    }
    try {
      const city = walks.find(w => w.revision.city.cityId === cityId)?.revision.city;
      if (!city || !owner || !meetingPoint || frequency === "once") throw new Error("Choose an organizer city and recurring schedule first.");
      if (!seriesId.current) seriesId.current = crypto.randomUUID();
      const existing = readRecurringPlan(window.localStorage, owner, cityId);
      persist({ version: 1, owner, cityId, seriesId: seriesId.current, firstDate, localTime, timeZone: cityTimeZone(city.meetingPoint), frequency, weekday, meetingPoint: { ...meetingPoint }, paused: existing?.paused ?? false, skippedDates: existing?.skippedDates ?? [] });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save recurring plan."); }
  }

  function makePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPreview([]); setReviewing(false);
    try {
      const city = walks.find(walk => walk.revision.city.cityId === cityId)?.revision.city;
      if (!city) throw new Error("Choose your city first.");
      const form = new FormData(event.currentTarget);
      if (!seriesId.current) seriesId.current = crypto.randomUUID();
      const occurrences = scheduleOccurrences({ seriesId: seriesId.current, firstDate: String(form.get("firstDate")), localTime: String(form.get("localTime")), timeZone: cityTimeZone(city.meetingPoint), weekday, frequency,
        count: frequency === "once" ? 1 : DEFAULT_OCCURRENCES, durationMinutes: 60 });
      const located=withEventMeetingPoint(occurrences, meetingPoint);
      setPreview(located); setSelected(new Set(located.map(d=>d.id))); setResults({});
      setMessage(`${occurrences.length} occurrences previewed. Review the checked walks before signing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check schedule details."); }
  }

  async function publishSelected() {
    if (lock.current || !owner) return;
    const chosen=preview.filter(o=>selected.has(o.id)&&results[o.id]?.status!=="published");
    if(!chosen.length){setMessage("Select at least one unpublished occurrence.");return;}
    lock.current=true;setBusy(true);
    try {
      if(await getBrowserExtensionPubkey()!==owner)throw new Error("Signer identity changed. Reconnect before publishing.");
      const [currentWalks,grants]=await Promise.all([loadCalendarWalks(relayConfig.writeRelays),queryAuthorizations(relayConfig.writeRelays)]);
      const walk=currentWalks.find(w=>w.revision.city.cityId===cityId);
      const grant=grants.find(g=>g.grant.cityId===cityId);
      if(!walk||!grant||!canEditCity(owner,grant.grant))throw new Error("This city is no longer approved for the connected organizer. Nothing was signed.");
      let completed=0;
      for(const occurrence of chosen){
        setResults(previous=>({...previous,[occurrence.id]:{status:"publishing"}}));
        try{
          if(await getBrowserExtensionPubkey()!==owner)throw new Error("Signer identity changed before signing.");
          let signed=signedRetries.current[occurrence.id];
          if(!signed){
            signed=await signWithBrowserExtension(createOrganizerCalendarEvent(walk,occurrence));
            if(signed.pubkey!==owner)throw new Error("The signed event belongs to a different identity.");
            signedRetries.current[occurrence.id]=signed;
          }
          if(await getBrowserExtensionPubkey()!==owner)throw new Error("Signer identity changed before publication.");
          await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
          const readBack=(await queryCalendarEvents(relayConfig.writeRelays,{ids:[signed.id],authors:[owner]})).find(e=>e.id===signed.id&&e.pubkey===owner);
          if(!readBack)throw new Error("The relay acknowledged the event but exact read-back failed. Retry will reuse the same signature.");
          delete signedRetries.current[occurrence.id];completed++;
          setResults(previous=>({...previous,[occurrence.id]:{status:"published",event:readBack}}));
        }catch(error){
          const detail=error instanceof Error?error.message:"Publication failed.";
          setResults(previous=>({...previous,[occurrence.id]:{status:"failed",detail}}));
          throw new Error(`${completed} walk(s) verified. Publication stopped at ${occurrence.localDate}: ${detail}`);
        }
      }
      try {
        const updated=await queryCalendarEvents(relayConfig.readRelays,{cityId});
        setPublishedByCity(previous=>({...previous,[cityId]:updated}));
      } catch {
        setMessage(`${completed} walk(s) verified. The scheduled list could not be refreshed; reconnect to load it from the relay.`);
        return;
      }
      setMessage(`${completed} selected walk(s) signed, accepted and read back from the staging relay.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not publish selected walks.");}
    finally{lock.current=false;setBusy(false);}
  }

  function publishedHref(walk:CalendarWalk,event:Event){
    const city=walk.revision.city;
    return eventPageHref(city.cityId,city.slug,calendarNevent(event,relayConfig.readRelays),directoryConfig.paidCities);
  }

  function draftPublishedHref(event:Event){
    const walk=walks.find(item=>item.revision.city.cityId===cityId);
    return walk?publishedHref(walk,event):"#";
  }

  function openForm(){
    setShowForm(true);
    if(walks.length===1&&!cityId){
      const city=walks[0].revision.city;
      setCityId(city.cityId);setMeetingPoint({...city.meetingPoint});
    }
  }

  return <main>
    <p>BitcoinWalk / organizer / events</p><h1>Scheduled walks</h1>
    <p><Link href="/organizer">City profile and permissions</Link></p>
    <button disabled={busy} onClick={load}>{owner ? "Refresh scheduled walks" : "Connect and load your walks"}</button>
    <p role="status">{message}</p>
    {!!owner && <button disabled={busy || !walks.length} onClick={openForm}>+ Add a walk</button>}
    {showForm && <section><h2>Add a walk</h2><button disabled={busy} onClick={()=>setShowForm(false)}>Close form</button>
    <p><strong>Organizer-owned NIP-52 publishing.</strong> Each checked occurrence is signed by your connected identity and verified independently on the shared staging relay. BitcoinWalk never receives your private key.</p>
    <p>Recurring plans are saved in this browser only, separately for each organizer and city. They are not synced or backed up. Reconnecting recalculates eight future drafts, including after missed weeks. Nothing is published automatically: every occurrence requires an explicit signer approval.</p>
    <label>City <select disabled={busy} value={cityId} onChange={e => {
      const selected = walks.find(w => w.revision.city.cityId === e.target.value)?.revision.city;
      const saved = plans[e.target.value];
      if (saved) { review(saved); return; }
      setCityId(e.target.value); setMeetingPoint(selected ? { ...selected.meetingPoint } : null); setPreview([]); setSelected(new Set()); setResults({}); signedRetries.current={}; seriesId.current = ""; setFirstDate(""); setLocalTime("10:00"); setFrequency("weekly"); setWeekday(DEFAULT_WEEKDAY); setReviewing(false);
    }}><option value="">Select your city</option>{walks.map(w => <option key={w.revision.city.cityId} value={w.revision.city.cityId}>{w.revision.city.cityName}</option>)}</select></label>
    {cityId && <form ref={scheduleForm} onSubmit={makePreview} onChange={() => { setPreview([]); setReviewing(false); }}>
      <fieldset disabled={busy} style={{ display: "grid", gap: "1rem" }}>
        <legend>Occurrence schedule</legend>
        <label>Repeat <select value={frequency} onChange={e => setFrequency(e.target.value as WalkSchedule["frequency"])}><option value="once">Does not repeat</option><option value="weekly">Every week</option><option value="fortnightly">Every two weeks</option></select></label>
        {frequency !== "once" && <label>Weekday <select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
        <label>{frequency === "once" ? "Walk date" : "Start on or after"} <input type="date" name="firstDate" min="2000-01-01" max="2099-12-31" value={firstDate} onChange={e => setFirstDate(e.target.value)} required /></label>
        <label>Start time <input type="time" name="localTime" value={localTime} onChange={e => setLocalTime(e.target.value)} required /></label>
        <p>All times are local to {walks.find(w => w.revision.city.cityId === cityId)?.revision.city.cityName}.</p>
        <h2>Meeting point for this walk</h2>
        <p>Starts from the city&apos;s default. Changing it here does not change the city profile.{frequency !== "once" && " This location will be copied into each occurrence in this new series."}</p>
        <label>Meeting-point description <input name="meetingDescription" value={meetingPoint?.description ?? ""} maxLength={500} required placeholder="e.g. Outside the cafe entrance" onChange={e => { setMeetingPoint(point => point ? { ...point, description: e.target.value } : null); setPreview([]); }} /></label>
        <LocationPicker key={cityId} cityName={walks.find(w => w.revision.city.cityId === cityId)?.revision.city.cityName ?? ""} onCityNameChange={() => {}} cityLocked value={meetingPoint} onChange={point => { if (!busy) { setMeetingPoint({ ...point }); setPreview([]); } }} />
        {frequency !== "once" && <p>Saturday is selected by default. The preview shows the next {DEFAULT_OCCURRENCES} occurrences.</p>}
        <button type="submit">Preview occurrences — no publication</button>
        {frequency !== "once" && <button type="button" onClick={savePlan}>Save recurring plan in this browser</button>}
      </fieldset>
    </form>}
    {cityId && plans[cityId] && <section><h2>Saved plan controls</h2><button disabled={busy} onClick={() => review(plans[cityId])}>Refresh / review saved drafts</button> <button disabled={busy} onClick={() => updateSaved({ paused: !plans[cityId].paused })}>{plans[cityId].paused ? "Resume" : "Pause"} recurring drafts</button><p>These controls use the saved plan, not unsaved form edits. Pausing does not cancel published walks.</p></section>}
    {!!preview.length && <section><h2>Review {preview.length} walk drafts</h2><p>Checked walks will each produce a separate signer request and NIP-52 event. A failure stops the batch; retrying reuses any already-signed event that was not verified.</p><ol>{preview.map(o => {const result=results[o.id];return <li key={o.id}><label><input type="checkbox" disabled={busy||result?.status==="published"} checked={selected.has(o.id)} onChange={e=>setSelected(previous=>{const next=new Set(previous);if(e.target.checked)next.add(o.id);else next.delete(o.id);return next;})}/> {new Intl.DateTimeFormat("en-GB", { timeZone: o.timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(o.start * 1000))}</label><br />{o.meetingPoint.description}<br /><small>Meeting pin: {o.meetingPoint.latitude.toFixed(6)}, {o.meetingPoint.longitude.toFixed(6)}</small>{result&&<p><strong>{result.status==="published"?"Published and verified":result.status==="publishing"?"Publishing…":"Failed"}</strong>{result.detail&&<> — {result.detail}</>}{result.event&&<>{" — "}<a href={draftPublishedHref(result.event)}>Open walk event</a></>}</p>}{reviewing && plans[cityId] && !result && <p><button disabled={busy} onClick={() => updateSaved({ skippedDates: [...new Set([...plans[cityId].skippedDates, o.localDate])] })}>Skip this draft</button></p>}</li>})}</ol><button disabled={busy||!preview.some(o=>selected.has(o.id)&&results[o.id]?.status!=="published")} onClick={publishSelected}>Sign and publish selected walks</button></section>}
    </section>}
    {!!owner && <>
      {walks.map(walk => {
        const city=walk.revision.city;
        const items=managedCalendarEvents(walk,publishedByCity[city.cityId]??[]);
        const current=items.filter(item=>item.status!=="past");
        const past=items.filter(item=>item.status==="past");
        const showPast=pastCities.has(city.cityId);
        const rows=(events:typeof items)=><ol>{events.map(item=><li key={item.event.id}>
          <strong>{item.status==="active"?"Happening now":item.status==="grace"?"Late-arrival window":item.status==="upcoming"?"Upcoming":"Past"}</strong> — {new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",...(item.timeZone?{timeZone:item.timeZone}:{})}).format(new Date(item.start*1000))}<br/>
          {item.meetingPoint.description}<br/><a href={publishedHref(walk,item.event)} target="_blank" rel="noreferrer">Open walk event ↗</a>
        </li>)}</ol>;
        return <section key={city.cityId}><h2>{city.cityName}</h2>
          <p>{current.length} current or upcoming walk{current.length===1?"":"s"}</p>
          {current.length?rows(current):<p>No upcoming walks scheduled for this city.</p>}
          {!!past.length&&<><button disabled={busy} onClick={()=>setPastCities(previous=>{const next=new Set(previous);if(showPast)next.delete(city.cityId);else next.add(city.cityId);return next;})}>{showPast?"Hide":`Show ${past.length}`} past walk{past.length===1?"":"s"}</button>{showPast&&rows(past)}</>}
        </section>;
      })}
      {!!Object.keys(plans).length && <section><h2>Saved recurring plans</h2>{Object.values(plans).map(plan => <p key={plan.cityId}>{walks.find(w => w.revision.city.cityId === plan.cityId)?.revision.city.cityName} — {plan.paused ? "Paused" : "Draft review available"} <button disabled={busy} onClick={() => review(plan)}>Review plan</button></p>)}</section>}
    </>}
  </main>;
}
