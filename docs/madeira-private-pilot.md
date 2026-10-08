# Madeira existing-account private staging rehearsal

8 October 2026 — BW-100 acceptance slice. Not live Pro activation or completed BW-108 MEP.

The organizer created staging and production Madeira using the same existing city
identity. Reuse it; do not create another account or alter its global Nostr profile.
Staging city `ca20993a-5b7f-443e-931e-8dbaa61d05fe` is approved, and its signed
creator matches `npub1wngvv89fzdm9cxydls3xt5nmedqp5xgxa0teeyqae9m6dx3p38cq25qahd`.
The checkout invoice has not been paid. A private fixture entitlement is deliberately
separate from `paid_city_entitlement`, invoice status, ordinary city-brand records,
public NIP-05/LNURL and production permissions.

## Boundaries

- Exact city/key allow-list, staging origin, staging database, loopback staging relay
  and `BITCOINWALK_MADEIRA_PILOT=private-fixture-v1` are all mandatory.
- Every API request has an authenticated private Nostr signature. Only the Madeira
  account and super-admin can read the request or its payout address.
- Both must sign the same one-hour challenge covering revision, approval, authority,
  payout version and destination. The organizer proves account control and confirms
  the saved payout; the admin authorizes only the unpaid isolated rehearsal.
- Current approval, creator, anchored ownership, suspension and original signed
  checkout payout are checked again before provisioning. Destination validation is
  repeated. Missing/unreadable/changed authority fails closed.
- The ordinary separate-owner/city-signer and settled-payment rules are unchanged.
  No kind-0 profile or kind-30312 binding is published; no ownership transfer occurs.
- Only the pinned private fixture provider at `.240:8890` via loopback `.138:18890`
  is reachable. Wallet reference `isolated-test`, allocation 7900/2100 and disabled
  issuance are fixed. No NWC credential or invoice-creation capability is provided.

## Organizer and super-admin steps

1. Open `https://app-staging.bitcoinwalk.org/admin/madeira-pilot`, connected as the
   existing BitcoinWalk in Madeira account.
2. Load the private request; check the saved personal payout destination. Sign
   **Sign account control and confirm payout**. This may prompt for proof plus
   request authentication. These signatures are stored privately, not broadcast.
3. Switch to the BitcoinWalk super-admin and open the same page. Load the request
   and sign **Sign staging-only test entitlement** within the challenge's hour.
4. Check/resume provisioning until exact independent read-back says **verified**.
   This means disabled fixture configuration only, never a live Lightning address.
5. Verify retries and service restart preserve one task and one Madeira configuration.
   Confirm checkout remains unpaid, no real paid entitlement exists, and production
   and the public profile are unchanged. Do not pay an invoice for this test.

An unsigned/partially signed expired request may be renewed by loading it; both
roles must sign the replacement. Accepted proofs persist for restart recovery.
Changed approval/authority/payout requires review, not silent replacement. Background
reconciliation retries unfinished tasks once per minute; verified/blocked tasks
are not polled continuously. Explicit Check revalidates verified provider state.

## Implementation and rollback

Private records use `madeira_private_pilot`; durable provider work uses the existing
`rustress_provision_task` outbox and leases. The fixture `brandEventId` is the private
admin attestation ID, **not** a public city-brand binding. This does not test profile
creation, public host replacement, real paid checkout, public address verification
or money movement; those retain their original backlog acceptance gates.

Deploy app 0.3.198 with the existing non-root staging helper and retained rollback
release/database backup. A dedicated user-service drop-in enables only the exact
Madeira flag; generic Rustress provisioning remains disabled. To stop the pilot,
remove/disable that drop-in and restart only the staging app. Retain private proof
and outbox records for audit; do not delete pending provider history. The isolated
provider remains invoice-disabled even if the app is rolled back. Never reuse this
fixture database/configuration for production activation.

`scripts/madeira-pilot-preflight.ts` opens staging SQLite read-only, verifies the
real signed city/payout evidence and reports only readiness/status, not credentials
or the payout address. It does not instantiate the payment runtime or create a task.

## Verification checkpoint

Node-24 suite: 893 tests across 174 files pass. TypeScript, changed-file lint and
production build pass. New coverage includes signed role/origin/scope/expiry
checks, unchanged payment tables, payout tampering and production-signature
rejection, changed approval/ownership/suspension, unavailable reads, private API
authentication, request bounds and redacted errors. The read-only `.138` preflight
verified real Madeira approval, existing identity, checkout payout signature and
current payout endpoint; invoice `pending`, paid entitlements `0`. No signatures
have been supplied to this private pilot yet.

Staging deployment completed as non-root `bitcoinwalk`: app `0.3.198`, source
`88fceb1` (pilot implementation `d9efe3d`), archive SHA-256
`9c8d86be1b78db26024ed94f33154bb8a6963a923bfbdd9ae015d32a168e8dea`.
Release `/opt/bitcoinwalk-app-staging/releases/0.3.198-9c8d86be1b78` is active.
Database/release evidence: `/home/bitcoinwalk/backups/app-staging-deploy.fuey8y`;
pilot flag evidence: `/home/bitcoinwalk/backups/madeira-pilot-enable.bTpeJm`.
Package smoke, public health, private-page login rendering and unsigned API
rejection pass. Post-deploy preflight again reports invoice `pending` and zero
paid entitlements. Both code commits are on ngit and GitHub. Human signatures,
fixture Madeira apply/read-back and restart acceptance remain pending.

## Madeira recovery checkpoint — 8 October 2026

The user completed both private signatures, reported `verified`, then repeated
Check/resume and reload with both proofs still confirmed and provisioning verified.
The non-root recovery test restarted only `.240`'s
`bitcoinwalk-rustress-fixture.service` and `.138`'s
`bitcoinwalk-app-staging.service`. Both returned active; public health remained
app `0.3.198`. No production service was restarted.

Before/after SQLite record fingerprints and authenticated provider read-back agree:

- One private challenge with both proofs; digest
  `db5ab0fa847f4b196b558078e9ded83975d5f2b68d5ecfef704215da2133c8e5`.
- One verified task, no active lease; digest
  `50763c561a66a807b9d092f75c416a1e2d2315ccfac2fc67e5a0ad67734ed1af`.
- One Madeira claim, configuration, user and split; combined digest
  `e9e250d617cd5af02251d0e5305cea765d87ca0dff68a5ea6ac547435260e6d3`.
- Provider version 1 remains applied, configuration hash
  `c3e46575008c6d887a464a4a9166a579115a931d22033e65cc65c1d65747c933`,
  issuance disabled. Fixture invoice count zero, wallet credentials absent.
- Checkout invoice remains pending; real paid entitlement count zero.

Server-side completed-state persistence and retry checks passed. Final user
reload/Check after restart remains pending. This does not claim a live
interrupted-write or payment-recovery test; uncertain-write behavior is covered
by the separate workflow fixture tests. BW-100 remains in progress.
