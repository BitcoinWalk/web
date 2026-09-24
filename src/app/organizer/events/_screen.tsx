"use client";
import {useDashboard,useDashboardAutoLoad} from "../../../components/dashboard-context";

import dynamic from "next/dynamic";
import type { LocationValue } from "../../../components/location-picker";
import { withEventMeetingPoint, type LocatedOccurrence } from "../../../domain/event-location";
import { useRef, useState, type FormEvent } from "react";
import { verifyEvent, type Event } from "nostr-tools";
import { DEFAULT_OCCURRENCES, DEFAULT_WEEKDAY, WEEKDAYS, scheduleOccurrences, type WalkSchedule } from "../../../domain/walk-schedule";
import { calendarNevent, loadCalendarWalks, type CalendarWalk } from "../../../nostr/calendar-records";
import { queryCalendarDeletion, queryCalendarEvents, queryCityCalendarCancellations } from "../../../nostr/city-records";
import { queryAuthorizations } from "../../../nostr/city-records";
import WalkDelegation from "../../../components/walk-delegation";
import {queryHostedWalks,type HostedWalk} from "../../../nostr/hosted-walks";
import { canEditCity } from "../../../nostr/organizer-edit";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../../nostr/signer";
import { createOrganizerCalendarEvent } from "../../../nostr/calendar-event";
import { publishVerifiedEvent } from "../../../nostr/relay";
import { relayConfig } from "../../../lib/relay-config";
import { cityTimeZone } from "../../../domain/city-time";
import { showCityInPicker } from "../../../domain/city-picker";
import { editDraftOccurrence, readRecurringPlan, saveRecurringPlan, upcomingDrafts, type RecurringPlan } from "../../../domain/rolling-drafts";
import { eventPageHref, managedCalendarEvents, type ManagedCalendarEvent } from "../../../domain/event-routing";
import { directoryConfig } from "../../../lib/directory-config";
import { reconcileOccurrences } from "../../../domain/recurrence-reconciliation";
import { createOrganizerCancellation } from "../../../nostr/moderation";

const LocationPicker = dynamic(() => import("../../../components/location-picker"), { ssr: false });

type WalkListRow=
  | {kind:"draft";key:string;at:number;walk:CalendarWalk;draft:LocatedOccurrence;inReview:boolean}
  | {kind:"upcoming"|"past";key:string;at:number;walk:CalendarWalk;item:ManagedCalendarEvent;hosted:boolean}
  | {kind:"canceled";key:string;at:number;walk:CalendarWalk;deletion:Event;targetId:string};

export default function OrganizerEventsPage() {
  const [hosted,setHosted]=useState<HostedWalk[]>([]);
  const [hostingError,setHostingError]=useState("");
  const [walks, setWalks] = useState<CalendarWalk[]>([]);
  const [publishedByCity, setPublishedByCity] = useState<Record<string, Event[]>>({});
  const [canceledByCity,setCanceledByCity]=useState<Record<string,Event[]>>({});
  const [cityId, setCityId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [visibleStatuses,setVisibleStatuses]=useState<Set<WalkListRow["kind"]>>(()=>new Set(["upcoming","draft"]));
  const [preview, setPreview] = useState<LocatedOccurrence[]>([]);
  const [coverage, setCoverage] = useState<{ planned: number; published: number; missing: number } | null>(null);
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
  const [editingId,setEditingId]=useState("");
  const [editDate,setEditDate]=useState("");
  const [editTime,setEditTime]=useState("");
  const [editMeetingPoint,setEditMeetingPoint]=useState<LocationValue|null>(null);
  const signedRetries = useRef<Record<string, Event>>({});
  const seriesId = useRef("");
  const lock = useRef(false);
  const scheduleForm = useRef<HTMLFormElement>(null);

  async function completeCityEvents(relays:string[],id:string){
    const events=await queryCalendarEvents(relays,{cityId:id});
    if(events.length>=500)throw new Error("This city has reached the bounded relay read limit. No walk was signed; ask an administrator to review the event history.");
    return events;
  }

  function reconcile(cityId:string,drafts:LocatedOccurrence[],timeZone:string){
    const walk=walks.find(item=>item.revision.city.cityId===cityId);
    if(!walk||!Object.hasOwn(publishedByCity,cityId))throw new Error("Published walks have not been loaded for this city. Reconnect before reviewing drafts.");
    return reconcileOccurrences(drafts,managedCalendarEvents(walk,publishedByCity[cityId]),timeZone);
  }

  function reconciliationMessage(result:ReturnType<typeof reconcileOccurrences>){
    const warnings=[
      result.multipleDates.length?` Multiple published walks share these dates: ${result.multipleDates.join(", ")}. They count once.`:"",
      result.timeConflicts.length?` Published times differ from this plan on: ${result.timeConflicts.join(", ")}. No replacement was proposed.`:"",
    ].join("");
    return `${result.covered.length} planned date(s) already published; ${result.missing.length} new date(s) available for review.${warnings}`;
  }

  const dashboard=useDashboard();
  useDashboardAutoLoad(load);
  async function load() {
    if (lock.current) return;
    setHosted([]);setHostingError("");
    lock.current = true; setBusy(true); setWalks([]); setPublishedByCity({}); setCanceledByCity({}); setCityId(""); setShowForm(false); setPreview([]); setCoverage(null); setMeetingPoint(null); setOwner(""); setPlans({}); setReviewing(false); setSelected(new Set()); setResults({}); setEditingId(""); signedRetries.current={};
    try {
      const key = await getBrowserExtensionPubkey();
      let available:CalendarWalk[]=[];
      let published:Record<string,Event[]>={};
      let canceled:Record<string,Event[]>={};
      let cityError="";
      try {
        const [approved, grants] = await Promise.all([loadCalendarWalks(relayConfig.readRelays), queryAuthorizations(relayConfig.readRelays)]);
        if (await getBrowserExtensionPubkey() !== key) throw new Error("Signer changed. Connect again.");
        available = approved.filter(walk => {
          const latest = grants.find(record => record.grant.cityId === walk.revision.city.cityId);
          return (!dashboard.selectedCity||walk.revision.city.cityId===dashboard.selectedCity) && latest && canEditCity(key, latest.grant);
        });
        for (const walk of available) {
          const id=walk.revision.city.cityId;
          [published[id],canceled[id]]=await Promise.all([completeCityEvents(relayConfig.readRelays,id),queryCityCalendarCancellations(relayConfig.readRelays,id)]);
        }
      } catch (error) {
        available=[];published={};canceled={};
        cityError=`City walks could not be loaded: ${error instanceof Error?error.message:"Relay data unavailable."} Your hosting assignments are loaded separately.`;
      }
      if (await getBrowserExtensionPubkey() !== key) throw new Error("Signer changed. Connect again.");
      setWalks(available);
      setPublishedByCity(published);
      setCanceledByCity(canceled);
      setOwner(key);
      let hostingCount=0;
      try{
        const assigned=(await queryHostedWalks(relayConfig.readRelays,key)).filter(h=>!dashboard.selectedCity||h.walk.revision.city.cityId===dashboard.selectedCity);
        if(await getBrowserExtensionPubkey()!==key)throw new Error("Signer changed. Reconnect to load your hosting list.");
        setHosted(assigned);hostingCount=assigned.length;
      }catch(error){setHostingError(error instanceof Error?error.message:"Could not load delegated walks. Refresh to retry.");}
      if(await getBrowserExtensionPubkey()!==key){setWalks([]);setPublishedByCity({});setOwner("");setHosted([]);throw new Error("Signer changed. Connect again.");}
      const saved: Record<string, RecurringPlan> = {};
      const problems: string[] = [];
      for (const walk of available) {
        try {
          const plan = readRecurringPlan(window.localStorage, key, walk.revision.city.cityId);
          if (plan) { saved[plan.cityId] = plan; upcomingDrafts(plan); }
        } catch { problems.push(walk.revision.city.cityName); }
      }
      setPlans(saved);
      setMessage([cityError,problems.length ? `Saved drafts need attention for: ${problems.join(", ")}. They were not overwritten.` : ""].filter(Boolean).join(" ") || (available.length||hostingCount ? "" : "No walks or city editing permissions were returned for this identity."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load cities."); }
    finally { lock.current = false; setBusy(false); }
  }

  function review(plan: RecurringPlan) {
    try {
      const drafts = upcomingDrafts(plan);
      const result=reconcile(plan.cityId,drafts,plan.timeZone);
      setShowForm(true);
      setCityId(plan.cityId); setMeetingPoint({ ...plan.meetingPoint }); setFrequency(plan.frequency);
      setWeekday(plan.weekday); setFirstDate(plan.firstDate); setLocalTime(plan.localTime); seriesId.current = plan.seriesId;
      setPreview(result.missing); setSelected(new Set(result.missing.map(d=>d.id))); setResults({}); setEditingId(""); setReviewing(true);
      setCoverage({ planned: drafts.length, published: result.covered.length, missing: result.missing.length });
      setMessage(plan.paused ? "Recurring plan paused. Resume to replenish drafts." : reconciliationMessage(result));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not review saved plan."); }
  }

  function persist(plan: RecurringPlan) {
    const drafts = upcomingDrafts(plan);
    const result=reconcile(plan.cityId,drafts,plan.timeZone);
    saveRecurringPlan(window.localStorage, plan);
    setPlans(previous => ({ ...previous, [plan.cityId]: plan }));
    setPreview(result.missing); setSelected(new Set(result.missing.map(d=>d.id))); setResults({}); setEditingId(""); setReviewing(true);
    setCoverage({ planned: drafts.length, published: result.covered.length, missing: result.missing.length });
    setMessage(plan.paused ? "Plan paused in this browser. No published events were changed." : `Saved in this browser. ${reconciliationMessage(result)}`);
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
      const sameSchedule=existing?.seriesId===seriesId.current&&existing.firstDate===firstDate&&existing.localTime===localTime&&existing.frequency===frequency&&existing.weekday===weekday;
      persist({ version: 1, owner, cityId, seriesId: seriesId.current, firstDate, localTime, timeZone: cityTimeZone(city.meetingPoint), frequency, weekday, meetingPoint: { ...meetingPoint }, paused: existing?.paused ?? false, skippedDates: existing?.skippedDates ?? [],draftEdits:sameSchedule?existing?.draftEdits:undefined });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save recurring plan."); }
  }

  function makePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPreview([]); setCoverage(null); setReviewing(false); setEditingId("");
    try {
      const city = walks.find(walk => walk.revision.city.cityId === cityId)?.revision.city;
      if (!city) throw new Error("Choose your city first.");
      const form = new FormData(event.currentTarget);
      if (!seriesId.current) seriesId.current = crypto.randomUUID();
      const occurrences = scheduleOccurrences({ seriesId: seriesId.current, firstDate: String(form.get("firstDate")), localTime: String(form.get("localTime")), timeZone: cityTimeZone(city.meetingPoint), weekday, frequency,
        count: frequency === "once" ? 1 : DEFAULT_OCCURRENCES, durationMinutes: 60 });
      const located=withEventMeetingPoint(occurrences, meetingPoint);
      const result=reconcile(cityId,located,cityTimeZone(city.meetingPoint));
      setPreview(result.missing); setSelected(new Set(result.missing.map(d=>d.id))); setResults({});
      setCoverage({ planned: located.length, published: result.covered.length, missing: result.missing.length });
      setMessage(reconciliationMessage(result));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check schedule details."); }
  }

  function beginEdit(draft:LocatedOccurrence){
    if(signedRetries.current[draft.id]){setMessage("This draft already has a signed publication retry. Finish that retry or refresh before editing.");return;}
    setEditingId(draft.id);setEditDate(draft.localDate);setEditTime(draft.localTime);setEditMeetingPoint({...draft.meetingPoint});setMessage("Edit this unsigned walk draft, then save it before publishing.");
  }

  function saveDraftEdit(draft:LocatedOccurrence){
    try{
      if(busy||editingId!==draft.id||results[draft.id]?.status==="published"||signedRetries.current[draft.id])throw new Error("This walk can no longer be edited as a draft. Refresh the list.");
      if(!editMeetingPoint)throw new Error("Choose a meeting point for this draft.");
      const edit={localDate:editDate,localTime:editTime,meetingPoint:{...editMeetingPoint}};
      const updated=editDraftOccurrence(draft,edit);
      if(preview.some(other=>other.id!==draft.id&&other.localDate===updated.localDate))throw new Error("Another draft is already scheduled for this date.");
      const walk=walks.find(item=>item.revision.city.cityId===cityId);
      if(!walk)throw new Error("The city is no longer available. Refresh the walks.");
      const conflict=reconcileOccurrences([updated],managedCalendarEvents(walk,publishedByCity[cityId]??[]),updated.timeZone).covered.length;
      if(conflict)throw new Error("A walk is already published for that city date. Choose another date.");
      const plan=plans[cityId];
      if(reviewing&&plan?.seriesId===draft.seriesId){
        const next={...plan,draftEdits:{...plan.draftEdits,[draft.id]:edit}};
        saveRecurringPlan(window.localStorage,next);
        setPlans(previous=>({...previous,[cityId]:next}));
      }
      setPreview(previous=>previous.map(item=>item.id===draft.id?updated:item));
      setResults(previous=>{const next={...previous};delete next[draft.id];return next;});
      setEditingId("");setMessage(reviewing&&plan?.seriesId===draft.seriesId?"Draft saved in this browser. Review the updated date, time and meeting point before signing.":"Draft updated for this review. It has not been published.");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save draft changes.");}
  }

  async function publishSelected() {
    if (lock.current || !owner) return;
    const chosen=preview.filter(o=>selected.has(o.id)&&results[o.id]?.status!=="published");
    if(!chosen.length){setMessage("Select at least one unpublished occurrence.");return;}
    lock.current=true;setBusy(true);
    try {
      if(await getBrowserExtensionPubkey()!==owner)throw new Error("Signer identity changed. Reconnect before publishing.");
      const [currentWalks,grants,currentEvents]=await Promise.all([loadCalendarWalks(relayConfig.writeRelays),queryAuthorizations(relayConfig.writeRelays),completeCityEvents(relayConfig.writeRelays,cityId)]);
      const walk=currentWalks.find(w=>w.revision.city.cityId===cityId);
      const grant=grants.find(g=>g.grant.cityId===cityId);
      if(!walk||!grant||!canEditCity(owner,grant.grant))throw new Error("This city is no longer approved for the connected organizer. Nothing was signed.");
      const currentRows=managedCalendarEvents(walk,currentEvents);
      const clash=chosen.find(occurrence=>{
        const matches=reconcileOccurrences([occurrence],currentRows,occurrence.timeZone).covered;
        if(!matches.length)return false;
        const retry=signedRetries.current[occurrence.id];
        return !retry||!currentEvents.some(event=>event.id===retry.id);
      });
      if(clash)throw new Error(`${clash.localDate} already has a published city walk. Nothing was signed. Refresh the scheduled list before trying again.`);
      let completed=0;
      for(const occurrence of chosen){
        setResults(previous=>({...previous,[occurrence.id]:{status:"publishing"}}));
        try{
          if(await getBrowserExtensionPubkey()!==owner)throw new Error("Signer identity changed before signing.");
          let signed=signedRetries.current[occurrence.id];
          if(signed){
            const existing=currentEvents.find(event=>event.id===signed.id&&event.pubkey===owner);
            if(existing){delete signedRetries.current[occurrence.id];completed++;setResults(previous=>({...previous,[occurrence.id]:{status:"published",event:existing}}));continue;}
          }
          const freshEvents=await completeCityEvents(relayConfig.writeRelays,cityId);
          if(reconcileOccurrences([occurrence],managedCalendarEvents(walk,freshEvents),occurrence.timeZone).covered.length)throw new Error(`${occurrence.localDate} already has a published city walk. No duplicate was signed.`);
          if(!signed){
            signed=await signWithBrowserExtension(createOrganizerCalendarEvent(walk,occurrence));
            if(signed.pubkey!==owner)throw new Error("The signed event belongs to a different identity.");
            signedRetries.current[occurrence.id]=signed;
          }
          if(await getBrowserExtensionPubkey()!==owner)throw new Error("Signer identity changed before publication.");
          await publishVerifiedEvent(signed,relayConfig.writeRelays,1,authenticateWithBrowserExtension);
          const readBack=(await queryCalendarEvents(relayConfig.writeRelays,{ids:[signed.id],authors:[owner]})).find(e=>e.id===signed.id&&e.pubkey===owner);
          if(!readBack)throw new Error("The relay acknowledged the event but exact read-back failed. Retry will reuse the same signature.");
          currentEvents.push(readBack);
          delete signedRetries.current[occurrence.id];completed++;
          setResults(previous=>({...previous,[occurrence.id]:{status:"published",event:readBack}}));
        }catch(error){
          const detail=error instanceof Error?error.message:"Publication failed.";
          setResults(previous=>({...previous,[occurrence.id]:{status:"failed",detail}}));
          throw new Error(`${completed} walk(s) verified. Publication stopped at ${occurrence.localDate}: ${detail}`);
        }
      }
      try {
        const updated=await completeCityEvents(relayConfig.readRelays,cityId);
        setPublishedByCity(previous=>({...previous,[cityId]:updated}));
      } catch {
        setMessage(`${completed} walk(s) verified. The scheduled list could not be refreshed; reconnect to load it from the relay.`);
        return;
      }
      setMessage(`${completed} selected walk(s) signed, accepted and read back from the staging relay.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not publish selected walks.");}
    finally{lock.current=false;setBusy(false);}
  }

  async function cancelWalk(walk: CalendarWalk, event: Event) {
    if (lock.current || !owner) return;
    const city = walk.revision.city;
    if (event.pubkey !== owner) { setMessage("Only the signer of this walk can cancel it. A super-admin can moderate it from /admin."); return; }
    if (!window.confirm(`Cancel this individual ${city.cityName} walk?\n\nEvent: ${event.id}\n\nThe city and its other walks remain. The event will be hidden on the BitcoinWalk relay, but copies in other apps may remain. A saved recurring plan may offer this date again; nothing will republish automatically.`)) return;
    lock.current = true; setBusy(true);
    try {
      if (await getBrowserExtensionPubkey() !== owner) throw new Error("Signer identity changed. Reconnect before cancelling.");
      for (const relay of relayConfig.writeRelays) {
        const endpoint = new URL(relay); endpoint.protocol = "https:";
        const response = await fetch(endpoint, { headers: { Accept: "application/nostr+json" }, signal: AbortSignal.timeout(5000), cache: "no-store" });
        if (!response.ok || !["bitcoinwalk-organizers-0.6.1","bitcoinwalk-organizers-0.7.0","bitcoinwalk-organizers-0.7.1"].includes((await response.json()).version)) throw new Error("Organizer cancellation is not enabled on this relay. Nothing signed or cancelled.");
      }
      const live = await queryCalendarEvents(relayConfig.writeRelays, { ids: [event.id] });
      if (!live.some(item => item.id === event.id && item.pubkey === owner)) throw new Error("This exact walk is no longer public. Refresh the scheduled list.");
      const template = createOrganizerCancellation(event, city.cityId, owner);
      setMessage("Review the individual walk cancellation in your signer…");
      const signed = await signWithBrowserExtension(template);
      if (!verifyEvent(signed) || signed.pubkey !== owner || signed.kind !== template.kind || signed.created_at !== template.created_at || signed.content !== template.content || JSON.stringify(signed.tags) !== JSON.stringify(template.tags)) throw new Error("Signer returned a different identity or cancellation. Nothing published.");
      if (await getBrowserExtensionPubkey() !== owner) throw new Error("Signer identity changed before publication.");
      await publishVerifiedEvent(signed, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
      const [tombstones, remaining] = await Promise.all([queryCalendarDeletion(relayConfig.writeRelays, event.id, owner), queryCalendarEvents(relayConfig.writeRelays, { ids: [event.id] })]);
      if (!tombstones.some(item => item.id === signed.id) || remaining.length) throw new Error("Cancellation acknowledged, but exact relay read-back was inconclusive. Refresh before retrying.");
      const updated = await completeCityEvents(relayConfig.readRelays, city.cityId);
      const canceled=await queryCityCalendarCancellations(relayConfig.readRelays,city.cityId);
      setPublishedByCity(previous => ({ ...previous, [city.cityId]: updated }));
      setCanceledByCity(previous=>({...previous,[city.cityId]:canceled}));
      setMessage(`${city.cityName}: this walk was cancelled and its relay tombstone verified. Other walks remain. External copies may remain.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not cancel this walk."); }
    finally { lock.current = false; setBusy(false); }
  }

  function publishedHref(walk:CalendarWalk,event:Event){
    const city=walk.revision.city;
    return eventPageHref(city.cityId,city.slug,calendarNevent(event,relayConfig.readRelays),directoryConfig.paidCities);
  }

  function openForm(){
    setShowForm(true);
    if(walks.length===1&&!cityId){
      const city=walks[0].revision.city;
      setCityId(city.cityId);setMeetingPoint({...city.meetingPoint});
    }
  }

  function planSummary(plan:RecurringPlan){
    if(plan.paused)return "Paused — published walks are unchanged";
    try{
      const result=reconcile(plan.cityId,upcomingDrafts(plan),plan.timeZone);
      return `${result.covered.length} of ${DEFAULT_OCCURRENCES} upcoming dates published · ${result.missing.length} need review${result.multipleDates.length?` · Multiple walks on ${result.multipleDates.join(", ")}`:""}`;
    }catch{return "Plan needs attention — review before signing";}
  }

  const rows:WalkListRow[]=[];
  const draftWarnings:string[]=[];
  for(const walk of walks){
    const city=walk.revision.city;
    const id=city.cityId;
    for(const item of managedCalendarEvents(walk,publishedByCity[id]??[]))rows.push({kind:item.status==="past"?"past":"upcoming",key:`event:${item.event.id}`,at:item.start,walk,item,hosted:false});
    for(const deletion of canceledByCity[id]??[]){
      const targetId=deletion.tags.find(tag=>tag[0]==="e")![1];
      rows.push({kind:"canceled",key:`cancel:${deletion.id}`,at:deletion.created_at,walk,deletion,targetId});
    }
    const drafts=new Map<string,LocatedOccurrence>();
    const plan=plans[id];
    if(plan){
      try{
        const pending=reconcileOccurrences(upcomingDrafts(plan),managedCalendarEvents(walk,publishedByCity[id]??[]),plan.timeZone).missing;
        for(const draft of pending)drafts.set(draft.id,draft);
      }catch(error){draftWarnings.push(`${city.cityName}: ${error instanceof Error?error.message:"Saved drafts could not be loaded."}`);}
    }
    if(id===cityId)for(const draft of preview){if(results[draft.id]?.status!=="published")drafts.set(draft.id,draft);else drafts.delete(draft.id);}
    for(const draft of drafts.values())rows.push({kind:"draft",key:`draft:${id}:${draft.id}`,at:draft.start,walk,draft,inReview:id===cityId&&preview.some(item=>item.id===draft.id)});
  }
  for(const {walk,item} of hosted){
    if(!rows.some(row=>row.key===`event:${item.event.id}`))rows.push({kind:item.status==="past"?"past":"upcoming",key:`event:${item.event.id}`,at:item.start,walk,item,hosted:true});
  }
  const cityGroups=new Map<string,{name:string;rows:WalkListRow[]}>();
  for(const row of rows){
    if(!visibleStatuses.has(row.kind))continue;
    const city=row.walk.revision.city;
    const group=cityGroups.get(city.cityId)??{name:city.cityName,rows:[]};
    group.rows.push(row);
    cityGroups.set(city.cityId,group);
  }
  const cities=[...cityGroups.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name));
  for(const [,city] of cities)city.rows.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));

  return <main>
    <h1>Walks</h1>
    {message&&<p role="status">{message}</p>}
    {hostingError&&<p role="alert">Hosting assignments could not be loaded: {hostingError}</p>}
    {!!owner && !!walks.length && <button disabled={busy} onClick={openForm}>+ Add a walk</button>}
    {showForm && <section><h2>Add a walk</h2><button disabled={busy} onClick={()=>setShowForm(false)}>Close form</button>
    <p><strong>Organizer-owned NIP-52 publishing.</strong> Each checked occurrence is signed by your connected identity and verified independently on the shared staging relay. BitcoinWalk never receives your private key.</p>
    <p>Recurring plans are saved in this browser only, separately for each organizer and city. They are not synced or backed up. Reconnecting recalculates eight future drafts, including after missed weeks. Nothing is published automatically: every occurrence requires an explicit signer approval.</p>
    <label>City <select disabled={busy} value={cityId} onChange={e => {
      const selected = walks.find(w => w.revision.city.cityId === e.target.value)?.revision.city;
      const saved = plans[e.target.value];
      if (saved) { review(saved); return; }
      setCityId(e.target.value); setMeetingPoint(selected ? { ...selected.meetingPoint } : null); setPreview([]); setCoverage(null); setSelected(new Set()); setResults({}); signedRetries.current={}; seriesId.current = ""; setFirstDate(""); setLocalTime("10:00"); setFrequency("weekly"); setWeekday(DEFAULT_WEEKDAY); setReviewing(false);
    }}><option value="">Select your city</option>{walks.filter(w=>showCityInPicker(w.revision.city.cityName)).map(w => <option key={w.revision.city.cityId} value={w.revision.city.cityId}>{w.revision.city.cityName}</option>)}</select></label>
    {cityId && <form ref={scheduleForm} onSubmit={makePreview} onChange={() => { setPreview([]); setCoverage(null); setReviewing(false); }}>
      <fieldset disabled={busy} style={{ display: "grid", gap: "1rem" }}>
        <legend>Occurrence schedule</legend>
        <label>Repeat <select value={frequency} onChange={e => setFrequency(e.target.value as WalkSchedule["frequency"])}><option value="once">Does not repeat</option><option value="weekly">Every week</option><option value="fortnightly">Every two weeks</option></select></label>
        {frequency !== "once" && <label>Weekday <select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
        <label>{frequency === "once" ? "Walk date" : "Start on or after"} <input type="date" name="firstDate" min="2000-01-01" max="2099-12-31" value={firstDate} onChange={e => setFirstDate(e.target.value)} required /></label>
        <label>Start time <input type="time" name="localTime" value={localTime} onChange={e => setLocalTime(e.target.value)} required /></label>
        <p>All times are local to {walks.find(w => w.revision.city.cityId === cityId)?.revision.city.cityName}.</p>
        <h2>Meeting point for this walk</h2>
        <p>Starts from the city&apos;s default. Changing it here does not change the city profile.{frequency !== "once" && " This location will be copied into each occurrence in this new series."}</p>
        <label>Meeting-point description <input name="meetingDescription" value={meetingPoint?.description ?? ""} maxLength={500} required placeholder="e.g. Outside the cafe entrance" onChange={e => { setMeetingPoint(point => point ? { ...point, description: e.target.value } : null); setPreview([]); setCoverage(null); }} /></label>
        <LocationPicker key={cityId} cityName={walks.find(w => w.revision.city.cityId === cityId)?.revision.city.cityName ?? ""} onCityNameChange={() => {}} cityLocked value={meetingPoint} onChange={point => { if (!busy) { setMeetingPoint({ ...point }); setPreview([]); setCoverage(null); } }} />
        {frequency !== "once" && <p>Saturday is selected by default. The preview shows the next {DEFAULT_OCCURRENCES} occurrences.</p>}
        <button type="submit">Preview occurrences — no publication</button>
        {coverage && <p role="status"><strong>{coverage.published} of {coverage.planned} planned walk dates already scheduled. {coverage.missing === 0 ? "No new walks need publishing; nothing was signed." : `${coverage.missing} new walk date${coverage.missing === 1 ? "" : "s"} ready to review below.`}</strong></p>}
        {frequency !== "once" && <button type="button" onClick={savePlan}>Save recurring plan in this browser</button>}
      </fieldset>
    </form>}
    {cityId && plans[cityId] && <section><h2>Saved plan controls</h2><button disabled={busy} onClick={() => review(plans[cityId])}>Refresh / review saved drafts</button> <button disabled={busy} onClick={() => updateSaved({ paused: !plans[cityId].paused })}>{plans[cityId].paused ? "Resume" : "Pause"} recurring drafts</button><p>These controls use the saved plan, not unsaved form edits. Pausing does not cancel published walks.</p></section>}
    </section>}
    {!!owner&&<section>
      <div role="group" aria-label="Filter walks by status">{(["upcoming","draft","past","canceled"] as const).map(status=><button key={status} type="button" aria-pressed={visibleStatuses.has(status)} style={{opacity:visibleStatuses.has(status)?1:0.5}} onClick={()=>setVisibleStatuses(previous=>{const next=new Set(previous);if(next.has(status))next.delete(status);else next.add(status);return next;})}>{status[0].toUpperCase()+status.slice(1)}</button>)}</div>
      <button disabled={busy} onClick={load}>{busy?"Loading walks…":"Refresh walks"}</button>
      {draftWarnings.map(warning=><p role="alert" key={warning}>{warning}</p>)}
      {!rows.length&&<p>No walks found. Choose + Add a walk to prepare one.</p>}
      {!!rows.length&&!cities.length&&<p>No walks match the selected filters.</p>}
      {cities.map(([id,city])=><section key={id}><h3>{city.name}</h3><ol>{city.rows.map(row=><li key={row.key}>
        <strong>{row.kind==="draft"?"DRAFT":row.kind==="canceled"?"CANCELED":row.kind==="past"?"PAST":"UPCOMING"}</strong> — {row.walk.revision.city.cityName}<br/>
        {row.kind==="canceled"?<><span>Cancellation recorded {new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:"UTC"}).format(new Date(row.at*1000))} UTC. Original walk date unavailable.</span><br/><small>Event: {row.targetId}</small><br/><button type="button" onClick={()=>void navigator.clipboard.writeText(row.targetId).then(()=>setMessage("Canceled event ID copied.")).catch(()=>setMessage("Could not copy the event ID."))}>Copy event ID</button></>:row.kind==="draft"?<>
          {new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:row.draft.timeZone}).format(new Date(row.at*1000))} ({row.draft.timeZone})<br/>{row.draft.meetingPoint.description}<br/><small>Meeting pin: {row.draft.meetingPoint.latitude.toFixed(6)}, {row.draft.meetingPoint.longitude.toFixed(6)}</small>
          {row.inReview?<><p><label><input type="checkbox" disabled={busy||results[row.draft.id]?.status==="published"} checked={selected.has(row.draft.id)} onChange={e=>setSelected(previous=>{const next=new Set(previous);if(e.target.checked)next.add(row.draft.id);else next.delete(row.draft.id);return next;})}/> Select for signing</label> <button type="button" disabled={busy} onClick={()=>beginEdit(row.draft)}>Edit walk</button>{reviewing&&plans[row.walk.revision.city.cityId]&&!results[row.draft.id]&&<> <button type="button" disabled={busy} onClick={()=>updateSaved({skippedDates:[...new Set([...plans[row.walk.revision.city.cityId].skippedDates,row.draft.id.split(":").at(-1)!])]})}>Skip this draft</button></>}</p>{results[row.draft.id]&&<p role="status">{results[row.draft.id].status}: {results[row.draft.id].detail??""}</p>}</>:<p><button type="button" disabled={busy} onClick={()=>{const plan=plans[row.walk.revision.city.cityId];if(plan){review(plan);beginEdit(row.draft);}}}>Edit walk</button> <button type="button" disabled={busy} onClick={()=>{const plan=plans[row.walk.revision.city.cityId];if(plan)review(plan);}}>Review for publishing</button></p>}
          {editingId===row.draft.id&&<form onSubmit={event=>{event.preventDefault();saveDraftEdit(row.draft);}}><fieldset disabled={busy}><legend>Edit this walk draft</legend><label>Date <input type="date" required min="2000-01-01" max="2099-12-31" value={editDate} onChange={event=>setEditDate(event.target.value)}/></label><label>Local start time <input type="time" required value={editTime} onChange={event=>setEditTime(event.target.value)}/></label><label>Meeting-point description <input required maxLength={500} value={editMeetingPoint?.description??""} onChange={event=>setEditMeetingPoint(point=>point?{...point,description:event.target.value}:null)}/></label><LocationPicker key={`edit-${row.draft.id}`} cityName={row.walk.revision.city.cityName} onCityNameChange={()=>{}} cityLocked value={editMeetingPoint} onChange={point=>setEditMeetingPoint({...point})}/><button type="submit">Save this draft</button> <button type="button" onClick={()=>setEditingId("")}>Discard changes</button></fieldset></form>}
        </>:<>{new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",...(row.item.timeZone?{timeZone:row.item.timeZone}:{})}).format(new Date(row.at*1000))}{row.item.timeZone?` (${row.item.timeZone})`:""}<br/>{row.item.meetingPoint.description}<br/><a href={publishedHref(row.walk,row.item.event)} target="_blank" rel="noreferrer">Open walk event ↗</a>{row.hosted&&<> — You’re hosting</>}{row.kind==="upcoming"&&!row.hosted&&<>{row.item.event.pubkey===owner&&<> <button disabled={busy} onClick={()=>cancelWalk(row.walk,row.item.event)}>Cancel this walk</button></>} <WalkDelegation event={row.item.event} actor={owner} cityName={row.walk.revision.city.cityName} disabled={busy}/></>}</>}
      </li>)}</ol></section>)}
      {!!preview.length&&<p><button disabled={busy||!!editingId||!preview.some(draft=>selected.has(draft.id)&&results[draft.id]?.status!=="published")} onClick={publishSelected}>Sign and publish selected walks</button></p>}
      {!!Object.keys(plans).length&&<section><h3>Recurring plan controls</h3>{Object.values(plans).map(plan=><p key={plan.cityId}>{walks.find(w=>w.revision.city.cityId===plan.cityId)?.revision.city.cityName} — {planSummary(plan)} <button disabled={busy} onClick={()=>review(plan)}>Review missing dates</button></p>)}</section>}
    </section>}
  </main>;
}
