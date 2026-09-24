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

type Submission = { eventId: string; initialEventId?: string; author: string; cityId: string; slug: string; cityName: string; startAt: string; meetingPoint: string; city: CityDocument; previous?: string };
type State = { message: string; tone: "info" | "error" | "success"; approvedWalk?: { href: string; name: string } };

export default function SubmissionApprovals() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [heroImages,setHeroImages]=useState<Record<string,string>>({});
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
      const pending = pendingCityRevisions(revisions, approvals).filter(r=>!dashboard.selectedCity||r.city.cityId===dashboard.selectedCity).map(({ event, city }) => ({
        eventId: event.id,
        initialEventId: event.tags.find(tag=>tag[0]==="e" && tag[3]==="initial-walk")?.[1],
        author: event.pubkey,
        cityId: city.cityId,
        slug: city.slug,
        cityName: city.cityName,
        startAt: city.startAt,
        meetingPoint: city.meetingPoint.description,
        city,
        previous: event.tags.find(tag=>tag[0]==="e" && tag[3]==="previous")?.[1],
      }));
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
      const initialHero=heroImages[submission.eventId]?.trim();
      if(status==="approved"&&!submission.previous&&!initialHero)throw new Error("Choose the initial landscape image before approving this city.");
      if(initialHero){try{new URL(initialHero);}catch{throw new Error("Enter a valid HTTPS image URL before approving.");}if(!initialHero.startsWith("https://"))throw new Error("The initial image must use HTTPS.");}
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
        status,
      }));
      if (signed.pubkey !== pubkey) throw new Error("Signer identity changed; decision cancelled.");
      const publication = await publishVerifiedEvent(signed, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
      if (status === "approved" && submission.initialEventId) {
        const events = await queryCalendarEvents(relayConfig.readRelays, { ids: [submission.initialEventId] });
        const first = events.find(event => event.id === submission.initialEventId);
        const walk = { revision: { event: { id: submission.eventId, pubkey: submission.author } as Event, city: submission.city }, approval: { event: signed, approval: { cityId: submission.cityId, cityRevisionId: submission.eventId, initialEventId: submission.initialEventId, status: "approved" as const } } };
        if (!first || !matchesInitialCalendar(first, walk)) throw new Error("City approval was saved, but the first walk could not be verified. Do not approve again; retry the read and investigate publication.");
      }
      setSubmissions((items) => items.filter((item) => item.eventId !== submission.eventId));
      setState({
        message: `${status === "approved" ? "Approved" : "Rejected"} on ${publication.accepted.length} relay(s).`,
        tone: "success",
        ...(status === "approved" ? { approvedWalk: { href: `/${encodeURIComponent(submission.slug)}`, name: submission.cityName } } : {}),
      });
    } catch (error) {
      setState({ message: error instanceof Error ? error.message : "Could not publish the decision.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

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
          {!submission.previous&&<label>Initial landscape image URL <input type="url" required={false} placeholder="https://…" value={heroImages[submission.eventId]??""} onChange={event=>setHeroImages(images=>({...images,[submission.eventId]:event.target.value}))}/></label>}
          <p>Requested tier: {submission.city.requestedTier === "paid" ? "Paid — 21,000 sats once, lifetime access (preference only; payment and activation not verified)" : submission.city.requestedTier === "free" ? "Free" : "Not specified (older submission)"}. Approval does not activate paid benefits.</p>
          <p><a href={`/${encodeURIComponent(submission.slug)}`} target="_blank" rel="noreferrer">Open current approved page</a> (if published)</p>
          <button disabled={busy || (!submission.previous && !submission.initialEventId)} type="button" onClick={() => decide(submission, "approved")}>{submission.initialEventId ? "Approve and publish first walk" : "Approve revision"}</button>{" "}
          <button disabled={busy} type="button" onClick={() => decide(submission, "rejected")}>Reject</button>
        </article>
      ))}
    </section>
  );
}
