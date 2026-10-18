# Guide integration baseline — 16 October 2026

Read-only source review at web commit 6fa6065. No production access or private inbox read was performed. Development and Support tasks were dispatched, but returned no visible artifact in this checkout; this baseline was completed in the coordinating Walkie Talkie task from inspected source.

## Existing boundaries

- src/guide/core.ts:103–115 verifies recipient kind-10050 inbox lists and uses standard nostr-tools/nip59 wrapEvent.
- src/guide/service.ts:85–151 discovers inboxes, validates allowed routes, retries durable envelopes and reports relay acknowledgement, explicitly not reading.
- src/guide/outbox.ts:8,136–143 stores delivery purpose/state, attempts and next retry, and exposes pending batches. State transitions include acknowledged, obsolete and removed-recipient.
- src/guide/pro-setup.ts:12 reads the authenticated Pro workflow feed; HTTP failures remain failures.
- src/guide/operator.ts validates persisted wrapper/recipient for exact-event retry. This is not a conversational support API.
- docs/bitcoinwalk-guide.md documents notification-only scope, current-state checks, stale suppression and bot-key isolation.
- No inbound support case/answer service was established by the inspected notification path.

## Proposed redacted diagnostic contract

Restricted read-only projection: schemaVersion, observedAt, environment, app/guide release when verified, case correlation, canonicalCityId when permitted, workflowState, nextActor, safeActionCode, safe city URL, deliveryState, attemptCount, nextRetryAt and sanitized failure category. Values may be unknown; do not guess release or delivery facts. Derive canonical IDs and actions from verified current records.

Exclude wrapped/sender_copy payloads, decrypted message bodies, raw payout destinations, private keys, wallet connections, private invite/recovery tokens and service credentials. The existing Delivery type must not be serialized directly because it includes wrapped content and recipient identifiers. Recipient information requires explicit operator need and scoped access; ordinary support summaries can use a case correlation.

Requirements before implementation: per-role authenticated access, fresh account/city authorization, bounded query window/page size, redacted error categories, audit of operator access, retention decision and separate environment configuration. Never expose the raw database or bot signing capability to a conversational model.

## Work allocation

Development: implement projection/authorization and staging intake boundary under BW-67.
Support: approve field usefulness, case policy, knowledge and reply evaluation.
Walkie Talkie: fix BW-128 standard receive/send/recovery and prove recipient compatibility.
BW-143 remains next-action notifications; BW-112 remains idle reminders. No duplicate bot.

## Acceptance gates

Synthetic fixtures must verify wrong-role/account denial, stale ownership, pagination limits, secret-field exclusion and truthful unknown/error states. Then exercise opt-in NIP-17 intake and operator-approved reply on test identities with restart/deduplication and injection cases. Retention/privacy wording and the old notification-only disclaimer must be reconciled before inviting real users to reply.

Guide tests executed in this baseline: 21/21 passed across guide.test.ts and pro-setup.test.ts. Live delivery, live state and customer resolution remain unverified.
