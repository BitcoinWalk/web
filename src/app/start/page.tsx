"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import OrganizerIdentity from "../../components/organizer-identity";
import RegistrationPlans from "../../components/registration-plans";
import type { LocationValue } from "../../components/location-picker";
import { registrationDocument, registrationSlug, type RequestedTier } from "../../domain/registration";
import { createCityUpdateEvent } from "../../nostr/city-event";
import { createInitialCalendarProposal } from "../../nostr/calendar-event";
import { publishVerifiedEvent } from "../../nostr/relay";
import { signForOrganizer } from "../../nostr/organizer-identity";
import { relayConfig } from "../../lib/relay-config";
import { chatConfig } from "../../lib/chat-config";
import { resolveCityChat } from "../../domain/chat";
import type { Event } from "nostr-tools";
import {resolvedFeatureFlags} from "../../nostr/feature-flags";
import {RichDescriptionEditor} from "../../components/rich-description";
import {HOUR_OPTIONS,MINUTE_OPTIONS,registrationLocalDateTime,type Meridiem} from "../../domain/registration-time";

const LocationPicker = dynamic(() => import("../../components/location-picker"), { ssr: false });
const DEFAULT_DESCRIPTION = "Join us for a friendly local BitcoinWalk: a relaxed way to meet fellow Bitcoiners, share ideas, and explore the city together. Everyone is welcome, whether you are new to Bitcoin or have been following it for years. Bring your questions, good shoes, and curiosity. We often continue the conversation over coffee or food after the walk.";
type SubmissionState = { kind: "idle" | "working" | "success" | "error"; message?: string };

export default function StartWalkPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [cityName, setCityName] = useState("");
  const [walkDate,setWalkDate]=useState(""),[walkHour,setWalkHour]=useState("10"),[walkMinute,setWalkMinute]=useState("00"),[meridiem,setMeridiem]=useState<Meridiem>("AM");
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [meetingDescription, setMeetingDescription] = useState("");
  const [organizerKey, setOrganizerKey] = useState<string | null>(null);
  const [requestedTier, setRequestedTier] = useState<RequestedTier>("free");
  const [paidEnabled,setPaidEnabled]=useState(false);
  const cityId = useRef("");
  const submitting = useRef(false);
  const pendingSubmission = useRef<{ walk: Event; revision: Event; city: string } | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const locked = state.kind === "working" || state.kind === "success";
  useEffect(() => { stepHeading.current?.focus(); }, [step]);
  useEffect(()=>{let active=true;resolvedFeatureFlags(relayConfig.readRelays).then(flags=>{if(active){setPaidEnabled(flags.paidTierRegistration);if(!flags.paidTierRegistration)setRequestedTier("free");}}).catch(()=>{if(active){setPaidEnabled(false);setRequestedTier("free");}});return()=>{active=false;};},[]);

  function draft() {
    if (!cityId.current) cityId.current = crypto.randomUUID();
    const startAt=registrationLocalDateTime(walkDate,walkHour,walkMinute,meridiem);
    return registrationDocument({ cityId: cityId.current, cityName, startAt, description, location,
      meetingDescription, requestedTier:paidEnabled?requestedTier:"free",
      // Preference never grants paid routing: only verified operator configuration can do that.
      chatUrl: resolveCityChat(undefined, registrationSlug(cityName), chatConfig).url ?? undefined });
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { draft(); setState({ kind: "idle" }); setStep(2); }
    catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "Check your walk details." }); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || locked || step !== 2) return;
    if (!organizerKey) { setState({ kind: "error", message: "Connect your chosen organizer identity first." }); return; }
    submitting.current = true;
    try {
      const candidate = draft();
      if (!relayConfig.writeRelays.length) throw new Error("City submissions are not connected yet.");
      const submissionDraft=JSON.stringify(candidate);
      if (pendingSubmission.current && (pendingSubmission.current.city !== submissionDraft || pendingSubmission.current.revision.pubkey !== organizerKey)) {
        pendingSubmission.current = null;
        throw new Error("Your walk details or signer changed after signing. Submit again to sign the updated request.");
      }
      if (!pendingSubmission.current) {
        setState({ kind: "working", message: "Please sign your first walk, followed by the city submission…" });
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const walk = await signForOrganizer(createInitialCalendarProposal(candidate, timeZone), organizerKey);
        const revision = await signForOrganizer(createCityUpdateEvent(candidate, undefined, walk.id), organizerKey);
        if (walk.pubkey !== organizerKey || revision.pubkey !== organizerKey) throw new Error("Signer identity changed. Reconnect and submit again.");
        pendingSubmission.current = { walk, revision, city: submissionDraft };
      }
      setState({ kind: "working", message: "Sending your signed first walk and city submission…" });
      await publishVerifiedEvent(pendingSubmission.current.walk, relayConfig.writeRelays, 1, template => signForOrganizer(template, organizerKey));
      const publication = await publishVerifiedEvent(pendingSubmission.current.revision, relayConfig.writeRelays, 1, template => signForOrganizer(template, organizerKey));
      pendingSubmission.current = null;
      setState({ kind: "success", message: `Thanks! Your BitcoinWalk in ${candidate.cityName} has been submitted for review. Reviews usually take several hours. BitcoinWalk Guide will send you a Nostr DM with your walk link once it is live. You can also check your dashboard for its status.${requestedTier === "paid" ? " Your Paid preference was recorded; no payment has been taken and paid benefits are not active yet." : " Your requested plan is Free."} Submitted to ${publication.accepted.length} relay(s).` });
    } catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "City submission failed." }); }
    finally { submitting.current = false; }
  }

  return <main data-hide-site-footer>
    {step===2&&<span tabIndex={-1} ref={stepHeading}/>}
    {/* Keep both steps mounted so map, image choice, form inputs and signer state survive Back. */}
    <div hidden={step !== 1} className="walk-details-frame">
      <h2 tabIndex={-1} ref={stepHeading}>Step 1 of 2 — Your walk details</h2>
      <form onSubmit={next}>
        <fieldset disabled={locked || step !== 1} style={{ display: "grid", gap: "1rem" }}>
          <LocationPicker cityName={cityName} onCityNameChange={setCityName} value={location} onChange={setLocation} />
          <fieldset className="walk-datetime">
            <legend>Walk date and time</legend>
            <label>Date<input name="walkDate" type="date" value={walkDate} onChange={event=>setWalkDate(event.target.value)} required/></label>
            <label>Hour<select name="walkHour" value={walkHour} onChange={event=>setWalkHour(event.target.value)} required>{HOUR_OPTIONS.map(hour=><option key={hour} value={hour}>{hour}</option>)}</select></label>
            <label>Minutes<select name="walkMinute" value={walkMinute} onChange={event=>setWalkMinute(event.target.value)} required>{MINUTE_OPTIONS.map(minute=><option key={minute} value={minute}>{minute}</option>)}</select></label>
            <div className="walk-datetime__period"><span>AM / PM</span><div role="group" aria-label="Walk time period"><button type="button" aria-pressed={meridiem==="AM"} onClick={()=>setMeridiem("AM")}>AM</button><button type="button" aria-pressed={meridiem==="PM"} onClick={()=>setMeridiem("PM")}>PM</button></div></div>
          </fieldset>
          <RichDescriptionEditor value={description} onChange={setDescription}/>
          <label>Meeting-point description <input name="meetingDescription" value={meetingDescription} onChange={e => setMeetingDescription(e.target.value)} placeholder="e.g. In front of the coffee shop" maxLength={500} /></label>
          <div className="walk-details-frame__next"><button type="submit">Next</button></div>
        </fieldset>
      </form>
    </div>
    <div hidden={step !== 2} className="start-account-step">
      <p><button className="start-account-step__back" type="button" disabled={locked} onClick={() => { setState({ kind: "idle" }); setStep(1); }}>&lt; Back to walk details</button></p>
      <form onSubmit={submit}>
        <OrganizerIdentity disabled={locked || step !== 2} onIdentityChange={setOrganizerKey} />
        {paidEnabled&&<RegistrationPlans value={requestedTier} onChange={setRequestedTier} disabled={locked || step !== 2} paidEnabled/>}
        <div className="start-account-step__submit"><button type="submit" disabled={!organizerKey || locked || step !== 2}>{state.kind === "working" ? "Submitting…" : "Submit"}</button></div>
      </form>
    </div>
    {state.message && <p role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>}
  </main>;
}
