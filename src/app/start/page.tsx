"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import OrganizerIdentity from "../../components/organizer-identity";
import RegistrationPlans from "../../components/registration-plans";
import HeroImagePicker from "../../components/hero-image-picker";
import type { LocationValue } from "../../components/location-picker";
import { registrationDocument, registrationSlug, type RequestedTier } from "../../domain/registration";
import { createCityUpdateEvent } from "../../nostr/city-event";
import { publishVerifiedEvent } from "../../nostr/relay";
import { signForOrganizer } from "../../nostr/organizer-identity";
import { relayConfig } from "../../lib/relay-config";
import { chatConfig } from "../../lib/chat-config";
import { resolveCityChat } from "../../domain/chat";

const LocationPicker = dynamic(() => import("../../components/location-picker"), { ssr: false });
const DEFAULT_DESCRIPTION = "Join us for a friendly local BitcoinWalk: a relaxed way to meet fellow Bitcoiners, share ideas, and explore the city together. Everyone is welcome, whether you are new to Bitcoin or have been following it for years. Bring your questions, good shoes, and curiosity. We often continue the conversation over coffee or food after the walk.";
type SubmissionState = { kind: "idle" | "working" | "success" | "error"; message?: string };

export default function StartWalkPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [cityName, setCityName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [meetingDescription, setMeetingDescription] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [organizerKey, setOrganizerKey] = useState<string | null>(null);
  const [requestedTier, setRequestedTier] = useState<RequestedTier>("free");
  const cityId = useRef("");
  const submitting = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const locked = state.kind === "working" || state.kind === "success";
  useEffect(() => { stepHeading.current?.focus(); }, [step]);

  function draft() {
    if (!cityId.current) cityId.current = crypto.randomUUID();
    return registrationDocument({ cityId: cityId.current, cityName, startAt, description, location,
      meetingDescription, heroImageUrl, requestedTier,
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
      setState({ kind: "working", message: "Waiting for your Nostr extension…" });
      const signed = await signForOrganizer(createCityUpdateEvent(candidate), organizerKey);
      const publication = await publishVerifiedEvent(signed, relayConfig.writeRelays, 1, template => signForOrganizer(template, organizerKey));
      setState({ kind: "success", message: `Submitted to ${publication.accepted.length} relay(s). It is awaiting approval.${requestedTier === "paid" ? " Your Paid preference was recorded. No payment has been taken and paid benefits are not activated." : " Your requested plan is Free."}` });
    } catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "City submission failed." }); }
    finally { submitting.current = false; }
  }

  return <main>
    <p>BitcoinWalk / start a walk</p>
    <h1>Start a BitcoinWalk</h1>
    <ol aria-label="Registration progress"><li aria-current={step === 1 ? "step" : undefined}>Walk details</li><li aria-current={step === 2 ? "step" : undefined}>Account &amp; plan</li></ol>
    <h2 tabIndex={-1} ref={stepHeading}>Step {step} of 2 — {step === 1 ? "Your walk" : "Account & plan"}</h2>
    <p>Your details stay here when you go back or connect a signer. They are not saved after closing or reloading this page.</p>
    {/* Keep both steps mounted so map, image choice, form inputs and signer state survive Back. */}
    <div hidden={step !== 1}>
      <form onSubmit={next}>
        <fieldset disabled={locked || step !== 1} style={{ display: "grid", gap: "1rem" }}>
          <legend>Walk details</legend>
          <LocationPicker cityName={cityName} onCityNameChange={setCityName} value={location} onChange={setLocation} />
          <label>Walk date and time <input name="startAt" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required /></label>
          <label>Walk description <textarea name="description" value={description} onChange={e => setDescription(e.target.value)} required maxLength={5000} /></label>
          <label>Meeting-point description <input name="meetingDescription" value={meetingDescription} onChange={e => setMeetingDescription(e.target.value)} placeholder="e.g. In front of the coffee shop" maxLength={500} /></label>
          <HeroImagePicker cityName={cityName} onUrlChange={setHeroImageUrl} />
          <button type="submit">Continue to account &amp; plan</button>
        </fieldset>
      </form>
    </div>
    <div hidden={step !== 2}>
      <p><strong>{cityName}</strong> · {startAt.replace("T", " ")} (your device&apos;s timezone)<br />Meeting point: {meetingDescription || location?.description}</p>
      <button type="button" disabled={locked} onClick={() => { setState({ kind: "idle" }); setStep(1); }}>Back to walk details</button>
      <OrganizerIdentity disabled={locked || step !== 2} onIdentityChange={setOrganizerKey} />
      <form onSubmit={submit}>
        <RegistrationPlans value={requestedTier} onChange={setRequestedTier} disabled={locked || step !== 2} />
        <p>Submission relay: {relayConfig.writeRelays.join(", ")}. Your walk proposal and requested tier are public. Do not include private details. Use a distinct test city name for staging.</p>
        <p>Your Nostr extension signs the submission. BitcoinWalk never receives your private key. Both plans require review and approval.</p>
        <button type="submit" disabled={!organizerKey || locked || step !== 2}>{state.kind === "working" ? "Submitting…" : requestedTier === "paid" ? "Submit Paid request for approval — no payment now" : "Submit Free walk for approval"}</button>
      </form>
    </div>
    {state.message && <p role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>}
  </main>;
}
