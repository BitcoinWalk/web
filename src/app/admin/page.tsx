"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CityModeration from "../../components/city-moderation";
import OrganizerInvitations from "../../components/organizer-invitations";
import type { CityDocument } from "../../domain/city";
import { relayConfig } from "../../lib/relay-config";
import { createApprovalEvent, createAuthorizationEvent } from "../../nostr/city-event";
import { pendingCityRevisions, queryApprovals, queryCityRevisions, queryAuthorizations } from "../../nostr/city-records";
import { isSuperAdmin } from "../../nostr/authority";
import { publishVerifiedEvent } from "../../nostr/relay";
import { authenticateWithBrowserExtension, getBrowserExtensionPubkey, signWithBrowserExtension } from "../../nostr/signer";

type Submission = { eventId: string; author: string; cityId: string; slug: string; cityName: string; startAt: string; meetingPoint: string; city: CityDocument; previous?: string };
type State = { message: string; tone: "info" | "error" | "success"; approvedWalk?: { href: string; name: string } };

export default function AdminPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<State>({ message: "Connect the BitcoinWalk super-admin signer to load submissions.", tone: "info" });
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (/^submission-[0-9a-f]{64}$/.test(target)) document.getElementById(target)?.scrollIntoView({ block: "center" });
  }, [submissions]);

  async function loadSubmissions() {
    if (relayConfig.readRelays.length === 0) {
      setState({ message: "Configure the BitcoinWalk relay to load submissions.", tone: "error" });
      return;
    }
    try {
      const pubkey = await getBrowserExtensionPubkey();
      if (!isSuperAdmin(pubkey)) throw new Error("This Nostr identity is not the BitcoinWalk super-admin.");
      setState({ message: "Authenticating with the relay…", tone: "info" });
      const [revisions, approvals] = await Promise.all([
        queryCityRevisions(relayConfig.readRelays, authenticateWithBrowserExtension),
        queryApprovals(relayConfig.readRelays, authenticateWithBrowserExtension),
      ]);
      const pending = pendingCityRevisions(revisions, approvals).map(({ event, city }) => ({
        eventId: event.id,
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
    }
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
      if (status === "approved") {
        const existing = (await queryAuthorizations(relayConfig.readRelays)).find(r => r.grant.cityId === submission.cityId);
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
        status,
      }));
      if (signed.pubkey !== pubkey) throw new Error("Signer identity changed; decision cancelled.");
      const publication = await publishVerifiedEvent(signed, relayConfig.writeRelays, 1, authenticateWithBrowserExtension);
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
    <main>
      <p>BitcoinWalk / admin</p>
      <h1>BitcoinWalk administration</h1>
      <CityModeration />
      <OrganizerInvitations />
      <h2>Submission approvals</h2>
      <p><Link href="/admin/calendar">Publish approved calendar events</Link></p>
      <p><Link href="/organizer">Edit an existing walk</Link></p>
      <p><Link href="/admin/editors">Manage city editors</Link></p>
      <p>Relay: {relayConfig.writeRelays.join(", ")}. First approval requires two signatures: creator registration, then approval. Check city-name duplicates before approving.</p>
      <p role="status">
        {state.message}
        {state.approvedWalk && <>{" "}<Link prefetch={false} href={state.approvedWalk.href}>View BitcoinWalk {state.approvedWalk.name} →</Link></>}
      </p>
      <button disabled={busy} type="button" onClick={loadSubmissions}>Connect and load submissions</button>
      {submissions.map((submission) => (
        <article key={submission.eventId} id={`submission-${submission.eventId}`}>
          <h2>{submission.cityName}</h2>
          <p>City ID: {submission.cityId}</p><p>Organizer: {submission.author}</p>
          <p>Revision: {submission.eventId}{submission.previous && <><br/>Based on: {submission.previous}</>}</p>
          <p>{new Date(submission.startAt).toLocaleString()} · {submission.meetingPoint}</p>
          <p style={{whiteSpace:"pre-wrap"}}>{submission.city.description}</p>
          <p>Meeting pin: {submission.city.meetingPoint.latitude}, {submission.city.meetingPoint.longitude}</p>
          <p>Hero image: {submission.city.heroImageUrl}</p>
          <p>Requested tier: {submission.city.requestedTier === "paid" ? "Paid — 21,000 sats once, lifetime access (preference only; payment and activation not verified)" : submission.city.requestedTier === "free" ? "Free" : "Not specified (older submission)"}. Approval does not activate paid benefits.</p>
          <p><a href={`/${encodeURIComponent(submission.slug)}`} target="_blank" rel="noreferrer">Open current approved page</a> (if published)</p>
          <button disabled={busy} type="button" onClick={() => decide(submission, "approved")}>Approve revision</button>{" "}
          <button disabled={busy} type="button" onClick={() => decide(submission, "rejected")}>Reject</button>
        </article>
      ))}
    </main>
  );
}
