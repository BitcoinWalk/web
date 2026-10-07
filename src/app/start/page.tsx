"use client";

import dynamic from "next/dynamic";
import {useRouter} from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import OrganizerIdentity from "../../components/organizer-identity";
import RegistrationPlans,{registrationActionLabel} from "../../components/registration-plans";
import CityPayment from "../../components/city-payment";
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
import {registrationSubmissionMessage} from "../../domain/registration-flow";
import {registrationDashboardHref,setRegistrationHandoff} from "../../domain/registration-handoff";
import {REGISTRATION_SERIES_SIZE,registrationSeriesDates,registrationSeriesStarts,type RegistrationRepeat} from "../../domain/registration-recurrence";
import {WEEKDAYS} from "../../domain/walk-schedule";

const LocationPicker = dynamic(() => import("../../components/location-picker"), { ssr: false });
const DEFAULT_DESCRIPTION = "Join us for a friendly local BitcoinWalk: a relaxed way to meet fellow Bitcoiners, share ideas, and explore the city together. Everyone is welcome, whether you are new to Bitcoin or have been following it for years. Bring your questions, good shoes, and curiosity. We often continue the conversation over coffee or food after the walk.";
type SubmissionState = { kind: "idle" | "working" | "success" | "error"; message?: string };

export default function StartWalkPage() {
  const router=useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [cityName, setCityName] = useState("");
  const [walkDate,setWalkDate]=useState(""),[walkHour,setWalkHour]=useState("10"),[walkMinute,setWalkMinute]=useState("00"),[meridiem,setMeridiem]=useState<Meridiem>("AM");
  const [repeat,setRepeat]=useState<RegistrationRepeat>("weekly"),[customInterval,setCustomInterval]=useState(3),[customWeekday,setCustomWeekday]=useState(6);
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [meetingDescription, setMeetingDescription] = useState("");
  const [organizerKey, setOrganizerKey] = useState<string | null>(null);
  const [requestedTier, setRequestedTier] = useState<RequestedTier>("free");
  const [payoutDestination,setPayoutDestination]=useState("");
  const [paidEnabled,setPaidEnabled]=useState(false);
  const [checkout,setCheckout]=useState<{cityId:string;revisionId:string;owner:string;cityName:string;relayCount:number}|null>(null);
  const cityId = useRef("");
  const submitting = useRef(false);
  const pendingSubmission = useRef<{ walks: Event[]; revision: Event; city: string } | null>(null);
  const detailsHeading=useRef<HTMLHeadingElement>(null),accountHeading=useRef<HTMLHeadingElement>(null),planHeading=useRef<HTMLHeadingElement>(null);
  const locked = state.kind === "working" || state.kind === "success";
  useEffect(()=>{({1:detailsHeading,2:accountHeading,3:planHeading} as const)[step].current?.focus();},[step]);
  useEffect(()=>{let active=true;resolvedFeatureFlags(relayConfig.readRelays).then(flags=>{if(active){setPaidEnabled(flags.paidTierRegistration);if(!flags.paidTierRegistration)setRequestedTier("free");}}).catch(()=>{if(active){setPaidEnabled(false);setRequestedTier("free");}});return()=>{active=false;};},[]);

  function draft() {
    if (!cityId.current) cityId.current = crypto.randomUUID();
    const startAt=registrationLocalDateTime(walkDate,walkHour,walkMinute,meridiem);
    const initialWalkStarts=registrationSeriesStarts(startAt,registrationSeriesDates(walkDate,repeat,customInterval,customWeekday));
    return registrationDocument({ cityId: cityId.current, cityName, startAt, description, location,
      initialWalkStarts,
      meetingDescription, requestedTier:paidEnabled?requestedTier:"free",
      // Preference never grants paid routing: only verified operator configuration can do that.
      chatUrl: resolveCityChat(undefined, registrationSlug(cityName), chatConfig).url ?? undefined });
  }

  function finishRegistration(candidate:ReturnType<typeof registrationDocument>,tier:"free"|"paid",paymentVerified:boolean){
    setRegistrationHandoff({cityId:candidate.cityId,cityName:candidate.cityName,tier,paymentVerified});
    router.push(registrationDashboardHref(candidate.cityId));
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { draft(); setState({ kind: "idle" }); setStep(2); }
    catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "Check your walk details." }); }
  }

  function choosePlan(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!organizerKey){setState({kind:"error",message:"Connect your chosen organizer identity first."});return;}setState({kind:"idle"});setStep(3);}

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || locked || step !== 3) return;
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
        setState({ kind: "working", message: "Please sign your walk series, followed by the city submission…" });
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const walks:Event[]=[];
        for(const [index,startAt] of (candidate.initialWalkStarts??[candidate.startAt]).entries()){
          setState({kind:"working",message:`Please sign walk ${index+1} of ${candidate.initialWalkStarts?.length??1}…`});
          const walk=await signForOrganizer(createInitialCalendarProposal(candidate,timeZone,"",startAt),organizerKey);
          if(walk.pubkey!==organizerKey)throw new Error("Signer identity changed. Reconnect and submit again.");
          walks.push(walk);
        }
        const revision = await signForOrganizer(createCityUpdateEvent(candidate, undefined, walks.map(walk=>walk.id)), organizerKey);
        if (revision.pubkey !== organizerKey) throw new Error("Signer identity changed. Reconnect and submit again.");
        pendingSubmission.current = { walks, revision, city: submissionDraft };
      }
      setState({ kind: "working", message: `Sending ${pendingSubmission.current.walks.length} signed walk${pendingSubmission.current.walks.length===1?"":"s"} and your city submission…` });
      for(const walk of pendingSubmission.current.walks)await publishVerifiedEvent(walk, relayConfig.writeRelays, 1, template => signForOrganizer(template, organizerKey));
      const publication = await publishVerifiedEvent(pendingSubmission.current.revision, relayConfig.writeRelays, 1, template => signForOrganizer(template, organizerKey));
      const revisionId=pendingSubmission.current.revision.id;
      pendingSubmission.current = null;
      if(candidate.requestedTier==="paid"){
        setCheckout({cityId:candidate.cityId,revisionId,owner:organizerKey,cityName:candidate.cityName,relayCount:publication.accepted.length});
        setState({kind:"idle"});
      }else finishRegistration(candidate,"free",false);
    } catch (error) { setState({ kind: "error", message: registrationSubmissionMessage(error) }); }
    finally { submitting.current = false; }
  }

  return <main data-hide-site-footer>
    {/* Keep all steps mounted so map, form inputs and signer state survive Back. */}
    <div hidden={step !== 1} className="walk-details-frame">
      <h2 tabIndex={-1} ref={detailsHeading}>Step 1 of 3 — Your walk details</h2>
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
          <div className="registration-repeat">
            <label>Repeat <select name="repeat" value={repeat} onChange={event=>setRepeat(event.target.value as RegistrationRepeat)}><option value="weekly">Every week</option><option value="fortnightly">Every 2nd week</option><option value="custom">Custom</option><option value="none">Don&apos;t repeat</option></select></label>
            {repeat==="custom"&&<fieldset className="registration-repeat__custom"><legend>Custom recurrence</legend><label>Every <span><input type="number" min="1" max="12" value={customInterval} onChange={event=>setCustomInterval(Number(event.target.value))}/> week(s)</span></label><label>On <select value={customWeekday} onChange={event=>setCustomWeekday(Number(event.target.value))}>{WEEKDAYS.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label><small>The selected date is the first walk; the custom pattern schedules the following walks.</small></fieldset>}
            {repeat!=="none"&&<small>A series of {REGISTRATION_SERIES_SIZE} walks will be created.</small>}
          </div>
          <div className="walk-details-frame__next"><button type="submit">Next</button></div>
        </fieldset>
      </form>
    </div>
    <div hidden={step !== 2} className="start-account-step">
      <p><button className="start-account-step__back" type="button" disabled={locked} onClick={() => { setState({ kind: "idle" }); setStep(1); }}>&lt; Back to walk details</button></p>
      <form onSubmit={choosePlan}>
        <OrganizerIdentity disabled={locked || step !== 2} onIdentityChange={setOrganizerKey} headingRef={accountHeading}/>
        <div className="start-account-step__submit"><button type="submit" disabled={!organizerKey || locked || step !== 2}>Next</button></div>
      </form>
    </div>
    <div hidden={step!==3} className="start-plan-step">
      {!checkout?<>
        <p><button className="start-account-step__back" type="button" disabled={locked} onClick={()=>{setState({kind:"idle"});setStep(2);}}>&lt; Back to your account</button></p>
        <h2 ref={planHeading} tabIndex={-1}>Step 3 of 3 — Choose your plan</h2>
        <form onSubmit={submit}>
          <RegistrationPlans value={requestedTier} onChange={setRequestedTier} disabled={locked||step!==3} paidEnabled={paidEnabled} showHeading={false}/>
          {requestedTier==="paid"&&<fieldset><legend>Your payout destination</legend><label>Lightning address or LNURL-pay<input value={payoutDestination} onChange={event=>setPayoutDestination(event.target.value)} required placeholder="you@example.com or lnurl1…" autoComplete="off" spellCheck={false}/></label><p>79% of payments to your city’s BitcoinWalk Lightning address will go to this private destination. BitcoinWalk retains 21%. We validate it before creating your Pro invoice; no test payment is sent.</p></fieldset>}
          <div className="start-account-step__submit"><button type="submit" disabled={!organizerKey||locked||step!==3||(requestedTier==="paid"&&!payoutDestination.trim())}>{registrationActionLabel(requestedTier,state.kind==="working")}</button></div>
        </form>
      </>:<CityPayment
        key={checkout.cityId}
        cityId={checkout.cityId}
        revisionId={checkout.revisionId}
        owner={checkout.owner}
        payoutDestination={payoutDestination}
        autoCreate
        passive
        onPaid={()=>finishRegistration(draft(),"paid",true)}
      />}
    </div>
    {state.message && <p role={state.kind === "error" ? "alert" : "status"}>{state.message}</p>}
    <footer style={{marginTop:"2rem",fontSize:".75rem",color:"#646b65",textAlign:"center"}}>Search by <a href="https://locationiq.com" target="_blank" rel="noreferrer">LocationIQ.com</a> · Fallback by <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></footer>
  </main>;
}
