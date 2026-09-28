"use client";
import {useDashboard,useDashboardAutoLoad} from "../../components/dashboard-context";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CityDocument } from "../../domain/city";
import { relayConfig } from "../../lib/relay-config";
import { createApprovalEvent, createAuthorizationEvent } from "../../nostr/city-event";
import { pendingCityRevisions, queryDirectoryRecords } from "../../nostr/city-records";
import { queryAuthorizations } from "../../nostr/city-records";
import { isSuperAdmin } from "../../nostr/authority";
import { publishVerifiedEvent } from "../../nostr/relay";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../nostr/signer";
import { matchesInitialCalendar } from "../../nostr/calendar-records";
import type { Event } from "nostr-tools";
import { queryCalendarEvents } from "../../nostr/city-records";
import { registrationSlug } from "../../domain/registration";
import {generateCityImage,importCityImageURL} from "../../lib/media-client";
import {cityFieldChanges} from "../../domain/city-diff";
import {calendarDiscoverySummary,publishCalendarDiscoveryEvent} from "../../nostr/calendar-discovery";

type Submission = { eventId: string; initialEventId?: string; author: string; cityId: string; slug: string; cityName: string; startAt: string; meetingPoint: string; city: CityDocument; previous?: string; previousCity?:CityDocument };
type State = { message: string; tone: "info" | "error" | "success"; approvedWalk?: { href: string; name: string } };
type ImageState={status:"idle"|"waiting"|"working"|"ready"|"error";message:string};

export default function SubmissionApprovals() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [heroImages,setHeroImages]=useState<Record<string,string>>({});
  const [imageStates,setImageStates]=useState<Record<string,ImageState>>({});
  const [slugs,setSlugs]=useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>({ message: "Connect the BitcoinWalk super-admin signer to load submissions.", tone: "info" });
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (/^submission-[0-9a-f]{64}$/.test(target)) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [submissions]);

  const dashboard=useDashboard();
  useDashboardAutoLoad(loadSubmissions);
  async function loadSubmissions() {
    if(busy)return;
    if (relayConfig.readRelays.length === 0) {
      setState({ message: "Configure the BitcoinWalk relay to load submissions.", tone: "error" });
      return;
    }
    setBusy(true);setSubmissions([]);
    try {
      const pubkey = await getBrowserExtensionPubkey();
      if (!isSuperAdmin(pubkey)) throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");
      setState({ message: "Loading submissions…", tone: "info" });
      const {revisions,approvals}=await queryDirectoryRecords(relayConfig.readRelays);
      if(await getBrowserExtensionPubkey()!==pubkey)throw new Error("Signer changed. Reconnect.");
      const pending = pendingCityRevisions(revisions, approvals).filter(r=>!dashboard.selectedCity||r.city.cityId===dashboard.selectedCity).map(({ event, city }) => {
        const previous=event.tags.find(tag=>tag[0]==="e" && tag[3]==="previous")?.[1];
        return ({
        eventId: event.id,
        initialEventId: event.tags.find(tag=>tag[0]==="e" && tag[3]==="initial-walk")?.[1],
        author: event.pubkey,
        cityId: city.cityId,
        slug: city.slug,
        cityName: city.cityName,
        startAt: city.startAt,
        meetingPoint: city.meetingPoint.description,
        city,
        previous,
        previousCity:previous?revisions.find(revision=>revision.event.id===previous)?.city:undefined,
      });});
      setSubmissions(pending);
      setState({ message: `${pending.length} pending submission(s).`, tone: "info" });
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "Could not load submissions.", tone: "error" });
    } finally {setBusy(false);}
  }

  async function decide(submission: Submission, status: "approved" | "rejected") {
    if (busy) return;
    if (relayConfig.writeRelays.length === 0) {
      setState({ message: "Configure the BitcoinWalk relay before publishing a decision.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const pubkey = await getBrowserExtensionPubkey();
      if (!isSuperAdmin(pubkey)) throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");
      let initialHero=heroImages[submission.eventId]?.trim();
      const approvedSlug=(slugs[submission.eventId]??(submission.previous?submission.slug:registrationSlug(submission.cityName))).trim();
      if(status==="approved"&&!submission.previous&&!initialHero)throw new Error("Choose the initial landscape image before approving this city.");
      if(initialHero){try{new URL(initialHero);}catch{throw new Error("Enter a valid HTTPS image URL before approving.");}if(!initialHero.startsWith("https://"))throw new Error("The initial image must use HTTPS.");}
      if(status==="approved"&&initialHero&&!initialHero.includes("/api/media/files/")){setState({message:"Approve importing the landscape into protected BitcoinWalk storage…",tone:"info"});initialHero=(await importCityImageURL(submission.cityId,initialHero)).url;}
      if (status === "approved") {
        const existing = (await queryAuthorizations(relayConfig.readRelays)).find(r => r.grant.cityId === submission.cityId);
        if (!existing && !submission.initialEventId) throw new Error("This new-city submission has no signed first walk. Reject it and ask the organizer to submit again.");
        if (!existing) {
          setState({ message: "Step 1/2: sign creator registration. If the later approval fails, registration remains; retrying approval will reuse it.", tone: "info" });
          const grant = await signWithBrowserExtension(createAuthorizationEvent({ cityId: submission.cityId, creatorPubkey: submission.author, creatorRevisionId: submission.eventId, editorPubkeys: [submission.author], superAdminPubkey: pubkey }));
          if (grant.pubkey !== pubkey) throw new Error("Signer identity changed; registration cancelled.");
          await publishVerifiedEvent(grant, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
        } else if (!existing.grant.editorPubkeys.includes(submission.author) && !isSuperAdmin(submission.author)) {
          throw new Error("This author is not authorized for this city. Existing editors were not changed.");
        }
      }
      setState({ message: "Sign the city decision…", tone: "info" });
      const signed = await signWithBrowserExtension(createApprovalEvent({
        cityId: submission.cityId,
        cityRevisionId: submission.eventId,
        ...(submission.initialEventId ? { initialEventId: submission.initialEventId } : {}),
        ...(initialHero?{heroImageUrl:initialHero}:{}),
        ...(status==="approved"?{slug:approvedSlug}:{}),
        status,
      }));
      if (signed.pubkey !== pubkey) throw new Error("Signer identity changed; decision cancelled.");
      const publication = await publishVerifiedEvent(signed, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
      let discoveryMessage="";
      if (status === "approved" && submission.initialEventId) {
        const events = await queryCalendarEvents(relayConfig.readRelays, { ids: [submission.initialEventId] });
        const first = events.find(event => event.id === submission.initialEventId);
        const walk = { revision: { event: { id: submission.eventId, pubkey: submission.author } as Event, city: submission.city }, approval: { event: signed, approval: { cityId: submission.cityId, cityRevisionId: submission.eventId, initialEventId: submission.initialEventId, status: "approved" as const } } };
        if (!first || !matchesInitialCalendar(first, walk)) throw new Error("City approval was saved, but the first walk could not be verified. Do not approve again; retry the read and investigate publication.");
        const discovery=await publishCalendarDiscoveryEvent(first,relayConfig.calendarDiscoveryRelays);
        discoveryMessage=` ${calendarDiscoverySummary(discovery,relayConfig.calendarDiscoveryRelays.length)}`;
      }
      setSubmissions((items) => items.filter((item) => item.eventId !== submission.eventId));
      setState({
        message: `${status === "approved" ? "Approved" : "Rejected"} on ${publication.accepted.length} BitcoinWalk relay(s).${discoveryMessage}`,
        tone: "success",
        ...(status === "approved" ? { approvedWalk: { href: `/${encodeURIComponent(approvedSlug)}`, name: submission.cityName } } : {}),
      });
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "Could not publish the decision.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function generateLandscape(submission:Submission){
    if(busy)return;setBusy(true);
    setImageStates(current=>({...current,[submission.eventId]:{status:"waiting",message:"Waiting for your signer. Approve the landscape-generation request…"}}));
    try{const pubkey=await getBrowserExtensionPubkey();if(!isSuperAdmin(pubkey))throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");setImageStates(current=>({...current,[submission.eventId]:{status:"working",message:"Generating and securing the landscape in BitcoinWalk storage. This can take about a minute…"}}));const result=await generateCityImage(submission.cityId,submission.eventId);setHeroImages(images=>({...images,[submission.eventId]:result.url}));setImageStates(current=>({...current,[submission.eventId]:{status:"ready",message:`Generated with ${result.model}. Review this selected image before approving the city.`}}));}catch(error){setImageStates(current=>({...current,[submission.eventId]:{status:"error",message:error instanceof Error?error.message:"Could not generate the landscape."}}));}finally{setBusy(false);}
  }

  async function importLandscape(submission:Submission){const source=heroImages[submission.eventId]?.trim();if(!source||source.includes("/api/media/files/"))return;if(busy)return;setBusy(true);setImageStates(current=>({...current,[submission.eventId]:{status:"waiting",message:"Waiting for your signer. Approve importing this image…"}}));try{const result=await importCityImageURL(submission.cityId,source);setHeroImages(images=>({...images,[submission.eventId]:result.url}));setImageStates(current=>({...current,[submission.eventId]:{status:"ready",message:"The image is secured in BitcoinWalk storage and selected for this city."}}));}catch(error){setImageStates(current=>({...current,[submission.eventId]:{status:"error",message:error instanceof Error?error.message:"Could not import the landscape."}}));}finally{setBusy(false);}}

  return (
    <section>
      <h2>Review requests</h2>
      <p>First approval requires two signatures: creator registration, then one approval that releases the organizer&apos;s exact signed first walk. Check city-name duplicates before approving. Paid benefits are not activated by approval.</p>
      <p role="status">
        {state.message}
        {state.approvedWalk && <>{" "}<Link prefetch={false} href={state.approvedWalk.href}>View BitcoinWalk {state.approvedWalk.name} →</Link></>}
      </p>
      <button disabled={busy} type="button" onClick={loadSubmissions}>Refresh submissions</button>
      {submissions.map((submission) => (
        <article key={submission.eventId} id={`submission-${submission.eventId}`}>
          <h2>{submission.cityName}</h2>
          <p>City ID: {submission.cityId}</p><p>Organizer: {submission.author}</p>
          <p>Revision: {submission.eventId}{submission.previous && <><br/>Based on: {submission.previous}</>}</p>
          <p>Signed first walk: {submission.initialEventId ?? "Missing (older submission)"}</p>
          <p>{new Date(submission.startAt).toLocaleString()} · {submission.meetingPoint}</p>
          <p style={{whiteSpace:"pre-wrap"}}>{submission.city.description}</p>
          <p>Meeting pin: {submission.city.meetingPoint.latitude}, {submission.city.meetingPoint.longitude}</p>
          <p>Organizer image: {submission.city.heroImageUrl??"None — expected for a new submission"}</p>
          <section aria-label={`Submitted changes for ${submission.cityName}`}>
            <h3>{submission.previous?"Submitted changes":"Complete submitted city"}</h3>
            {submission.previous&&!submission.previousCity&&<p role="alert">The referenced previous revision could not be loaded, so a reliable field-by-field comparison is unavailable. Do not approve until the complete history loads.</p>}
            {submission.previous&&submission.previousCity&&cityFieldChanges(submission.previousCity,submission.city).length===0&&<p>No city-document fields changed.</p>}
            {(!submission.previous||submission.previousCity)&&cityFieldChanges(submission.previousCity??null,submission.city).map(change=><article key={change.key} className="revision-change">
              <h4>{change.label}</h4>
              {submission.previous&&<div><strong>Previous signed value</strong><p style={{whiteSpace:"pre-wrap"}}>{change.before}</p>{change.image&&change.before!=="Not set"&&<img src={change.before} alt={`Previous ${change.label.toLowerCase()}`} referrerPolicy="no-referrer" style={{maxWidth:"24rem",width:"100%",height:"auto"}}/>}</div>}
              <div><strong>{submission.previous?"Submitted value":"Submitted value"}</strong><p style={{whiteSpace:"pre-wrap"}}>{change.after}</p>{change.image&&change.after!=="Not set"&&<img src={change.after} alt={`Submitted ${change.label.toLowerCase()}`} referrerPolicy="no-referrer" style={{maxWidth:"24rem",width:"100%",height:"auto"}}/>}</div>
            </article>)}
          </section>
          <label>Public city URL <span>https://bitcoinwalk.org/</span><input required minLength={2} maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slugs[submission.eventId]??(submission.previous?submission.slug:registrationSlug(submission.cityName))} onChange={event=>setSlugs(current=>({...current,[submission.eventId]:event.target.value.toLowerCase()}))}/></label>
          <p>Suggested from the city name. You can correct this before approval; use lowercase letters, numbers and hyphens.</p>
          {!submission.previous&&<><label>Initial landscape image URL <input type="url" required={false} placeholder="https://…" value={heroImages[submission.eventId]??""} onChange={event=>{setHeroImages(images=>({...images,[submission.eventId]:event.target.value}));setImageStates(current=>({...current,[submission.eventId]:{status:"idle",message:"Import this URL or generate a new landscape before approval."}}));}}/></label><p>The selected file is validated and stored by BitcoinWalk before approval. Public pages will not depend on an external URL.</p><button disabled={busy} type="button" onClick={()=>generateLandscape(submission)}>{imageStates[submission.eventId]?.status==="waiting"||imageStates[submission.eventId]?.status==="working"?"Generating landscape…":"Generate realistic city landscape"}</button>{" "}<button disabled={busy||!heroImages[submission.eventId]?.trim()||heroImages[submission.eventId]?.includes("/api/media/files/")} type="button" onClick={()=>importLandscape(submission)}>Import image URL</button><div aria-live="polite" role={imageStates[submission.eventId]?.status==="error"?"alert":"status"}><p>{imageStates[submission.eventId]?.message??"Generate a realistic landscape or import a PNG, JPEG or WebP URL. Approval stays disabled until a managed image is selected."}</p>{heroImages[submission.eventId]?.includes("/api/media/files/")&&<img src={heroImages[submission.eventId]} alt={`Selected landscape for ${submission.cityName}`} style={{maxWidth:"32rem",width:"100%",height:"auto"}}/>}</div><p>Generation is super-admin only, rate limited and never publishes automatically. Review the result before approval; you can regenerate it or replace it with an imported URL.</p></>}
          <p>Requested tier: {submission.city.requestedTier === "paid" ? "Paid — 21,000 sats once, lifetime access (preference only; payment and activation not verified)" : submission.city.requestedTier === "free" ? "Free" : "Not specified (older submission)"}. Approval does not activate paid benefits.</p>
          <p><a href={`/${encodeURIComponent(submission.slug)}`} target="_blank" rel="noreferrer">Open current approved page</a> (if published)</p>
          <button disabled={busy || (!!submission.previous&&!submission.previousCity) || (!submission.previous && (!submission.initialEventId||!heroImages[submission.eventId]?.includes("/api/media/files/")))} type="button" onClick={() => decide(submission, "approved")}>{submission.initialEventId ? "Approve city and publish first walk" : "Approve revision"}</button>{" "}
          <button disabled={busy} type="button" onClick={() => decide(submission, "rejected")}>Reject</button>
        </article>
      ))}
    </section>
  );
}
