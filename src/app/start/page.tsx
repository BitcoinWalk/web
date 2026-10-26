"use client";

import dynamic from "next/dynamic";
import {useRouter} from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {useTheme, ThemeToggle} from "../../design-system/theme-provider";
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
import {HOUR_24_OPTIONS,MINUTE_OPTIONS,registrationLocalDateTime} from "../../domain/registration-time";
import {registrationSubmissionMessage} from "../../domain/registration-flow";
import {registrationDashboardHref,setRegistrationHandoff} from "../../domain/registration-handoff";
import {REGISTRATION_SERIES_SIZE,registrationSeriesDates,registrationSeriesStarts,type RegistrationRepeat} from "../../domain/registration-recurrence";
import {WEEKDAYS} from "../../domain/walk-schedule";
import WalkProgress from "../../design-system/walk-progress";
import {validateDetailsStep} from "../../components/registration-details-validation";
import {cityTimeZone} from "../../domain/city-time";
import {REGISTRATION_DRAFT_KEY,parseRegistrationDraft,saveRegistrationDraft} from "../../domain/registration-browser-draft";
import ui from "../../design-system/primitives.module.css";
import styles from "./start.module.css";

const DETAIL_STEPS = ["Choose your city", "Place the pin or search for a meeting place", "Date and time", "Walk description", "Meeting details and repetition"];

const LocationPicker = dynamic(() => import("../../components/location-picker"), { ssr: false, loading:()=> <p role="status">Loading city search…</p> });
const DEFAULT_DESCRIPTION = "Join us for a friendly local BitcoinWalk: a relaxed way to meet fellow Bitcoiners, share ideas, and explore the city together. Everyone is welcome, whether you are new to Bitcoin or have been following it for years. Bring your questions, good shoes, and curiosity. We often continue the conversation over coffee or food after the walk.";
type SubmissionState = { kind: "idle" | "working" | "success" | "error"; message?: string };

export default function StartWalkPage() {
  const router=useRouter();
  const {theme}=useTheme();
  const desktopStepped=true;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [detailStep, setDetailStep] = useState(1);
  const mobileHeading = useRef<HTMLHeadingElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const viewport=window.visualViewport;
    if(!viewport)return;
    let frame=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        // VisualViewport shrinks above mobile keyboards even when the layout
        // viewport doesn't. Leave pinch zoom and desktop scrolling alone.
        if(viewport.scale!==1||!window.matchMedia("(max-width: 40rem)").matches)return;
        pageRef.current?.style.setProperty("--bw-visible-height",`${viewport.height}px`);
        const active=document.activeElement;
        if(active instanceof HTMLElement&&pageRef.current?.contains(active)&&active.matches("input,textarea,select,[contenteditable=true]")){
          active.scrollIntoView({block:"nearest",behavior:"instant"});
        }
      });
    };
    update();
    viewport.addEventListener("resize",update);
    return()=>{cancelAnimationFrame(frame);viewport.removeEventListener("resize",update);};
  },[]);
  function clearDetailErrors(){
    pageRef.current?.querySelectorAll<HTMLElement>("[data-detail-invalid]").forEach(field=>{
      field.removeAttribute("data-detail-invalid");field.removeAttribute("aria-invalid");
      const descriptions=(field.getAttribute("aria-describedby")??"").split(" ").filter(id=>id&&id!=="walk-details-error");
      if(descriptions.length)field.setAttribute("aria-describedby",descriptions.join(" "));else field.removeAttribute("aria-describedby");
    });
  }
  function showDetailStep(value:number) {
    clearDetailErrors();
    setState({kind:"idle"});
    setDetailStep(value);
    requestAnimationFrame(()=>mobileHeading.current?.focus());
  }
  const [state, setState] = useState<SubmissionState>({ kind: "idle" });
  const [cityName, setCityName] = useState("");
  const [walkDate,setWalkDate]=useState(""),[walkHour,setWalkHour]=useState(""),[walkMinute,setWalkMinute]=useState("");
  const [repeat,setRepeat]=useState<RegistrationRepeat>("weekly"),[customInterval,setCustomInterval]=useState(3),[customWeekday,setCustomWeekday]=useState(6);
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [meetingDescription, setMeetingDescription] = useState("");
  const [organizerKey, setOrganizerKey] = useState<string | null>(null);
  const [requestedTier, setRequestedTier] = useState<RequestedTier>("free");
  const [payoutDestination,setPayoutDestination]=useState("");
  const [paidEnabled,setPaidEnabled]=useState(false);
  const [checkout,setCheckout]=useState<{cityId:string;revisionId:string;owner:string;cityName:string;relayCount:number}|null>(null);
  const [draftReady,setDraftReady]=useState(false);
  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
    if(!active)return;
    try{const saved=parseRegistrationDraft(localStorage.getItem(REGISTRATION_DRAFT_KEY));if(saved){setCityName(saved.cityName);setLocation(saved.location);setWalkDate(saved.walkDate);setWalkHour(!saved.timeFormat&&saved.meridiem&&/^(1[0-2]|[1-9])$/.test(saved.walkHour)?String(Number(saved.walkHour)%12+(saved.meridiem==="PM"?12:0)).padStart(2,"0"):saved.walkHour);setWalkMinute(saved.walkMinute);setRepeat(saved.repeat);setCustomInterval(saved.customInterval);setCustomWeekday(saved.customWeekday);setDescription(saved.description);setMeetingDescription(saved.meetingDescription);setDetailStep(saved.detailStep);setStep(saved.step>1?2:1);}else localStorage.removeItem(REGISTRATION_DRAFT_KEY);}catch{/* Storage may be disabled. */}setDraftReady(true);
    });
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!draftReady||state.kind==="success"||checkout)return;
    if(!cityName&&!location&&!walkDate&&!walkHour&&!walkMinute&&description===DEFAULT_DESCRIPTION&&!meetingDescription){try{localStorage.removeItem(REGISTRATION_DRAFT_KEY);}catch{}return;}
    try{saveRegistrationDraft(localStorage,{version:1,savedAt:Date.now(),step,detailStep,cityName,location,walkDate,walkHour,walkMinute,timeFormat:"24h",repeat,customInterval,customWeekday,description,meetingDescription});}catch{/* Continue when browser storage is unavailable. */}
  },[draftReady,state.kind,checkout,step,detailStep,cityName,location,walkDate,walkHour,walkMinute,repeat,customInterval,customWeekday,description,meetingDescription]);
  const cityId = useRef("");
  const submitting = useRef(false);
  const pendingSubmission = useRef<{ walks: Event[]; revision: Event; city: string } | null>(null);
  const detailsHeading=useRef<HTMLHeadingElement>(null),accountHeading=useRef<HTMLHeadingElement>(null),planHeading=useRef<HTMLHeadingElement>(null);
  const locked = state.kind === "working" || state.kind === "success";
  useEffect(()=>{({1:detailsHeading,2:accountHeading,3:planHeading} as const)[step].current?.focus();},[step]);
  useEffect(()=>{let active=true;resolvedFeatureFlags(relayConfig.readRelays).then(flags=>{if(active){setPaidEnabled(flags.paidTierRegistration);if(!flags.paidTierRegistration)setRequestedTier("free");}}).catch(()=>{if(active){setPaidEnabled(false);setRequestedTier("free");}});return()=>{active=false;};},[]);

  function draft() {
    if (!cityId.current) cityId.current = crypto.randomUUID();
    const startAt=registrationLocalDateTime(walkDate,walkHour,walkMinute);
    const initialWalkStarts=registrationSeriesStarts(startAt,registrationSeriesDates(walkDate,repeat,customInterval,customWeekday));
    return registrationDocument({ cityId: cityId.current, cityName, startAt, description, location,
      initialWalkStarts,
      meetingDescription, requestedTier:paidEnabled?requestedTier:"free",
      // Preference never grants paid routing: only verified operator configuration can do that.
      chatUrl: resolveCityChat(undefined, registrationSlug(cityName), chatConfig).url ?? undefined });
  }

  function finishRegistration(candidate:ReturnType<typeof registrationDocument>,tier:"free"|"paid",paymentVerified:boolean){
    try{localStorage.removeItem(REGISTRATION_DRAFT_KEY);}catch{}
    setRegistrationHandoff({cityId:candidate.cityId,cityName:candidate.cityName,tier,paymentVerified});
    router.push(registrationDashboardHref(candidate.cityId));
  }

  function validateCurrentDetail(form:HTMLFormElement,all=false){
    clearDetailErrors();
    const fields={cityName,location,walkDate,walkHour,walkMinute,description,meetingDescription,repeat,customInterval,customWeekday};
    const errors=(all?[1,2,3,4,5]:[detailStep]).map(number=>validateDetailsStep(number,fields)).filter(error=>error!==null);
    const invalid=Array.from(form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>("input,select,textarea")).filter(field=>!field.disabled&&field.getClientRects().length&&!field.validity.valid);
    if(errors.length||invalid.length){
      const targets=[...new Set([...errors.flatMap(error=>Array.from(form.querySelectorAll<HTMLElement>(error.selector)).filter(field=>field.getClientRects().length)),...invalid])];
      for(const target of targets){target.setAttribute("aria-invalid","true");target.setAttribute("data-detail-invalid","");target.setAttribute("aria-describedby",`${target.getAttribute("aria-describedby")??""} walk-details-error`.trim());}
      setState({kind:"error",message:errors[0]?.message??invalid[0].validationMessage});
      requestAnimationFrame(()=>targets[0]?.focus());
      return false;
    }
    setState({kind:"idle"});return true;
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { draft(); setState({ kind: "idle" }); setStep(2); }
    catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "Check your walk details." }); }
  }

  function choosePlan(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!organizerKey){setState({kind:"error",message:"Connect your chosen host identity first."});return;}setState({kind:"idle"});setStep(3);}

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || locked || step !== 3) return;
    if (!organizerKey) { setState({ kind: "error", message: "Connect your chosen host identity first." }); return; }
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
        const timeZone = cityTimeZone(candidate.meetingPoint);
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

  return <main ref={pageRef} data-hide-site-footer className={styles.page} data-detail-step={detailStep} data-registration-step={step} data-stepped={desktopStepped||undefined}>
    <h1 className="sr-only">Start a walk</h1>
    <header className={styles.progressBar}><Link className={styles.homeLink} href="/" aria-label="BitcoinWalk homepage"><Image src={theme==="dark"?"/brand/bitcoinwalk-horizontal-white.png":"/brand/bitcoinwalk-horizontal.png"} width={156} height={48} alt="BitcoinWalk"/></Link><div>
      <WalkProgress step={step} hideSummary/>
      <div className={styles.mobileProgress}>
        <progress value={step===1?detailStep:DETAIL_STEPS.length+step-1} max={DETAIL_STEPS.length+2} aria-label="Registration progress"/>
      </div>
    </div><div className={styles.themeAction}><ThemeToggle/></div></header>
    {/* Keep all steps mounted so map, form inputs and signer state survive Back. */}
    <div hidden={step !== 1} className={`walk-details-frame ${styles.frame}`}>
      <h2 className="sr-only" tabIndex={-1} ref={detailsHeading}>Your Walk Details</h2>
      <h3 className={`${styles.mobileTitle} ${[3,4].includes(detailStep)?"sr-only":""}`} ref={mobileHeading} tabIndex={-1}>{DETAIL_STEPS[detailStep-1]}</h3>
      <form id="walk-details-form" noValidate aria-describedby={state.kind==="error"?"walk-details-error":undefined} onChange={()=>{if(state.kind==="error"){clearDetailErrors();setState({kind:"idle"});}}} onSubmit={event=>{
        if(desktopStepped||window.matchMedia("(max-width: 40rem)").matches){
          event.preventDefault();
          if(!validateCurrentDetail(event.currentTarget))return;
          if(detailStep<DETAIL_STEPS.length){showDetailStep(detailStep+1);return;}
        }else if(!validateCurrentDetail(event.currentTarget,true)){event.preventDefault();return;}
        next(event);
      }}>
        <fieldset disabled={locked || step !== 1} style={{ display: "grid", gap: "1rem" }}>
          <div className={styles.location}>{draftReady&&<LocationPicker cityName={cityName} onCityNameChange={setCityName} value={location} onChange={setLocation} mobileMapTabs stepped={desktopStepped} />}</div>
          <fieldset className="walk-datetime" data-detail-step="3">
            <legend>Walk date and time</legend>
            <div data-date-field className={styles.dateField}><label htmlFor="walk-date">Date</label><span className={styles.dateControl} data-empty={!walkDate}><input ref={dateRef} id="walk-date" name="walkDate" type="date" value={walkDate} onChange={event=>setWalkDate(event.target.value)} required/>{!walkDate&&<span className={styles.datePlaceholder} aria-hidden="true">Choose a date</span>}<button type="button" className={styles.calendarButton} aria-label="Choose walk date" onClick={()=>{const input=dateRef.current;if(!input)return;input.focus();try{input.showPicker?.();}catch{/* Native input remains usable if the browser doesn't support showPicker. */}}}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></button></span></div>
            <label>Hour (24 hour clock)<input name="walkHour" list="walk-hour-options" placeholder="00" inputMode="numeric" pattern="([01]?[0-9]|2[0-3])" maxLength={2} title="Enter an hour from 00 to 23" value={walkHour} onChange={event=>setWalkHour(event.target.value)} required/><datalist id="walk-hour-options">{HOUR_24_OPTIONS.map(hour=><option key={hour} value={hour}/>)}</datalist></label>
            <label>Minutes<input name="walkMinute" list="walk-minute-options" placeholder="00" inputMode="numeric" pattern="[0-5]?[0-9]" maxLength={2} title="Enter minutes from 00 to 59" value={walkMinute} onChange={event=>setWalkMinute(event.target.value)} required/><datalist id="walk-minute-options">{MINUTE_OPTIONS.map(minute=><option key={minute} value={minute}/>)}</datalist></label>
          </fieldset>
          <div data-detail-step="4"><RichDescriptionEditor value={description} onChange={setDescription} placeholder="What can people expect on your walk?" previewFirst/></div>
          <div data-detail-step="5" className={styles.detailsGroup}>
          <label>Meeting-point description <input name="meetingDescription" value={meetingDescription} onChange={e => setMeetingDescription(e.target.value)} placeholder="e.g. In front of the coffee shop" maxLength={500} /></label>
          <div className="registration-repeat">
            <label>Repeat <select name="repeat" value={repeat} onChange={event=>setRepeat(event.target.value as RegistrationRepeat)}><option value="weekly">Every week</option><option value="fortnightly">Every 2nd week</option><option value="custom">Custom</option><option value="none">Don&apos;t repeat</option></select></label>
            {repeat==="custom"&&<fieldset className="registration-repeat__custom"><legend className="sr-only">Custom recurrence</legend><label>Repeat every <span><input type="number" min="1" max="12" value={customInterval} onChange={event=>setCustomInterval(Number(event.target.value))}/> weeks</span></label><label>On weekday <select value={customWeekday} onChange={event=>setCustomWeekday(Number(event.target.value))}>{WEEKDAYS.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label><small>The first walk uses your selected date. Later walks follow this schedule.</small></fieldset>}
            {repeat!=="none"&&<small>A series of {REGISTRATION_SERIES_SIZE} walks will be created.</small>}
          </div>
          </div>
          <div className={styles.desktopNext}><div className="walk-details-frame__next"><button type="submit" className={ui.button}>Next</button></div></div>
        </fieldset>
      </form>
      {state.kind==="error"&&state.message&&step===1&&<div className={styles.inlineValidation}><p id="walk-details-error" role="alert">{state.message}</p></div>}
      <small className={styles.geocoderFooter}>Search by <a href="https://locationiq.com/" target="_blank" rel="noreferrer">LocationIQ</a> · Fallback by <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>
    </div>
    {!checkout&&<div className={styles.mobileControls} aria-label={step===1?"Walk details navigation":"Registration navigation"}>
      <Link href="/" className={styles.mobileHome} aria-label="BitcoinWalk homepage"><Image src="/brand/bitcoinwalk-icon.png" width={28} height={28} alt=""/></Link>
      {(step>1||detailStep>1)&&<button type="button" className={ui.button} data-details-back={step===1||undefined} disabled={locked} onClick={()=>{if(step===1)showDetailStep(detailStep-1);else{setState({kind:"idle"});setStep(step===3?2:1);}}}>Back</button>}
      <button type="submit" form={step===1?"walk-details-form":step===2?"walk-account-form":"walk-plan-form"} className={ui.button} disabled={locked||(step>1&&!organizerKey)||(step===3&&requestedTier==="paid"&&!payoutDestination.trim())}>{step===3?registrationActionLabel(requestedTier,state.kind==="working"):"Continue"}</button>
    </div>}
    <div hidden={step !== 2} className={`start-account-step ${styles.accountStep}`}>
      {state.kind==="error"&&state.message&&step===2&&<p role="alert" className={styles.inlineValidation}>{state.message}</p>}
      <p className={styles.desktopNext}><button className="start-account-step__back" type="button" disabled={locked} onClick={() => { setState({ kind: "idle" }); setStep(1); }}>&lt; Back to walk details</button></p>
      <form id="walk-account-form" onSubmit={choosePlan}>
        <OrganizerIdentity disabled={locked || step !== 2} onIdentityChange={setOrganizerKey} onAccountReady={()=>{setState({kind:"idle"});setStep(3);}} headingRef={accountHeading} heading="Your Access"/>
        <div className={styles.desktopNext}><div className="start-account-step__submit"><button type="submit" className={ui.button} disabled={!organizerKey || locked || step !== 2}>Next</button></div></div>
      </form>
    </div>
    <div hidden={step!==3} className={`start-plan-step ${styles.planStep}`}>
      {state.kind==="error"&&state.message&&step===3&&<p role="alert" className={styles.inlineValidation}>{state.message}</p>}
      {!checkout?<>
        <p className={styles.desktopNext}><button className="start-account-step__back" type="button" disabled={locked} onClick={()=>{setState({kind:"idle"});setStep(2);}}>&lt; Back to your account</button></p>
        <h2 ref={planHeading} tabIndex={-1}>Choose your plan</h2>
        <form id="walk-plan-form" onSubmit={submit}>
          <RegistrationPlans value={requestedTier} onChange={setRequestedTier} disabled={locked||step!==3} paidEnabled={paidEnabled} showHeading={false}/>
          {requestedTier==="paid"&&<fieldset><legend>Your payout destination</legend><label>Lightning address or LNURL-pay<input value={payoutDestination} onChange={event=>setPayoutDestination(event.target.value)} required placeholder="you@example.com or lnurl1…" autoComplete="off" spellCheck={false}/></label><p>79% of payments to your city’s BitcoinWalk Lightning address will go to this private destination. BitcoinWalk retains 21%. We validate it before creating your Pro invoice; no test payment is sent.</p></fieldset>}
          <div className={styles.desktopNext}><div className="start-account-step__submit"><button type="submit" className={ui.button} disabled={!organizerKey||locked||step!==3||(requestedTier==="paid"&&!payoutDestination.trim())}>{registrationActionLabel(requestedTier,state.kind==="working")}</button></div></div>
        </form>
      </>:checkout?<CityPayment
        key={checkout.cityId}
        cityId={checkout.cityId}
        revisionId={checkout.revisionId}
        owner={checkout.owner}
        payoutDestination={payoutDestination}
        autoCreate
        passive
        onPaid={()=>finishRegistration(draft(),"paid",true)}
      />:null}
    </div>
    {state.message && state.kind!=="error" && <p role="status">{state.message}</p>}
  </main>;
}
