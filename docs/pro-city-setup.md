# BW-105 — guided Pro city account setup

## Delivered first slice — 7 October 2026

The feature-gated `/admin/pro-setup` screen prepares an owner-only profile preview using an authenticated, origin-bound `/api/pro-setup` command. It is deliberately **preparation-only**, not a completed account activation flow.

The backend checks current approval, creator authorization, anchored directory ownership (where present), durable city entitlement and city/organizer suspensions. It never infers ownership from an editor-authored revision, payer, requested tier or public profile. Directory failures/conflicting transport states stop preparation rather than falling back to creator access. Bounded history reads fail at their limit. Recheck all authority evidence after artwork preparation to reject stale results.

The preview loads the logo pack for the exact approved revision and an integrity-checked managed hero. It requires the city photo rather than silently replacing it with a neutral background. Avatar v2 uses the larger BitcoinWalk icon without city lettering; the banner retains the city name. Only the proposed public name, website and image URLs are returned, never private entitlement IDs, owner evidence or payout details. NIP-05 and Lightning fields are absent until provisioning has independently succeeded.

Requests are signed private commands with a five-minute acceptance window, exact route/origin/action binding, bounded body and fresh signature verification. Read-only retries within that window are allowed but rate-limited (one attempt per identity per 30 seconds, two preparations per process). Responses are `no-store`; the page resets on dashboard identity changes. Deployment-wide ingress limits remain required: this process-local guard is not a distributed abuse-control system.

Returning to the page derives eligibility from the existing durable entitlement and reuses immutable artwork; there is no invoice creation or account generation in this slice. This is **not yet** a persisted multi-stage identity/payout setup task. The personal dashboard signer is unchanged.

## Enablement boundary

Default off: `BITCOINWALK_PRO_SETUP_PREVIEW=true` enables only this preview. The app also needs its existing payment runtime, configured directory transports, exact approved logo assets, persistent `BITCOINWALK_MEDIA_ROOT` and canonical `BITCOINWALK_PAYMENT_APP_ORIGIN`. No new secrets or wallet permissions are required for preview. Do not enable production account activation on the strength of this feature flag. No VPS rollout is included in this change.

The route is intentionally absent from normal navigation while activation is incomplete. Test through the direct dashboard path after explicitly enabling staging preview. Signed-in city choices are only navigation hints; the backend independently enforces ownership, including after rotation. An empty/incomplete city picker does not authorize entering another city's records.

## Work remaining before BW-105 can close

1. BW-101 continuation: the owner-signed field, LNURL endpoint/cycle validation and versioned private destination history are implemented. Registration-before-checkout reuse, durable gift/recovery tasks, provisioning revalidation and staging acceptance remain. Retain entitlement through all retries; never ask an already-paid city to repurchase. See [payout setup evidence](organizer-payout-setup.md).
2. Persistent setup task linking payout/artwork versions, city public key and BW-103 challenge/proofs. Resume after device changes without duplicate identities or lost selections; expired signatures need renewal.
3. Isolated city signer: create/import/remote signer, explicit backup acknowledgement, exact expected-key checking, cancellation and reconnection without replacing the personal dashboard signer.
4. Wire private proofs, super-admin review, approved binding publication and exact read-back. BW-106 must supply relay admission first; do not treat private SQLite approval as live activation.
5. City-signed profile publication, preserving existing fields and adding verified NIP-05/LNURL only after BW-19 readiness. No personal identity rename.
6. My cities entry point and Guide notification; self-purchase/fixture-gift recovery, mobile signer and pilot acceptance under BW-102. Real gift checkout remains BW-99.

BW-105 remains In progress. The dependency gates are reported in the UI, not hidden behind a successful-looking Submit button.

Verification: all 807 tests pass, including origin/time/tampering checks, current-owner versus editor and former-owner denial, directory outages, disapproval/suspension/unpaid denial, exact approved artwork lookup, post-render authority changes, missing photos, payout validation/history and invoice binding, private-field exclusion and API feature/rate limits. Typecheck, changed-file ESLint, production build and backlog validation also pass. Interactive signer/staging acceptance remains outstanding.
