# BitcoinWalk sponsorships

Public paid-package coverage (0.3.174): a current signed sponsor assignment is
restricted to that sponsor's verified purchased dates in the city. Exact event
ID/address/start and full package count must match; review-required orders do
not display. Walk modules and OG artwork expire at the scheduled end, including
manually approved legacy sponsors. Existing sponsored OG images and source
artwork are retained indefinitely, but are not selected for expired public
placements. Signed artwork approval is still required; no payment auto-signs
an assignment. City metadata follows its current/next walk's coverage.

BW-16 provides presentation and super-admin control. BW-89 now adds sponsorship
checkout at `/sponsor`: searchable approved cities, optional `?city=Warszawa`
preselection, fixed 1/2/5-walk packages, exact date selection, Lightning invoice
QR, verified settlement, then a signed association with the sponsor's npub.
Invoices and reservations live in the existing app payments SQLite database.
No spending method is exposed. These are NWC-verified Lightning invoice payments;
NIP-57 zap requests/receipts remain future work because identity is connected
after payment in the requested flow.

The public catalogue excludes unavailable, hidden, already-sponsored and past
walks, and requires at least one hour before the event. Cities without available
walks remain searchable with a contact link; no invoice is created. Packages
requiring more dates than available are disabled. Pending invoices reserve dates;
verified expiry releases them. Ambiguous invoice creation keeps the order and
reservation for support review rather than generating another invoice. Late
settlement after a conflicting booking, or changed/cancelled dates, is marked
paid and needing review. A payment never silently signs public sponsorship.

The browser keeps a random checkout recovery key; only its SHA-256 is stored
server-side. It can be exported/imported as a private recovery file. Claims require
both that key and a fresh order/site-bound Nostr signature, and cannot transfer
an already-associated order to a different identity. Background checks continue
after the browser closes. The **Payments** tab at `/admin/sponsor` lists payments by identity,
including paid orders awaiting identity and existing sponsors without recorded
payments. Access requires a super-admin signature.

## Signed model

Sponsorship assignments are retained, super-admin-signed kind-30311 records,
isolated by the `bitcoinwalk-sponsorship` namespace.
They target either a city UUID or a city UUID plus stable NIP-52 occurrence
address. Each revision links to its predecessor and records one explicit mode:

- `hidden`: render nothing;
- `empty`: show the invitation to sponsor;
- `sponsor`: show the sponsor npub and approved website;
- `inherit`: walk-only reset to the city assignment.

An optional start/end interval makes an expired sponsor become an open sponsor
slot rather than silently falling back to a different advertiser. The global
**Sponsor Invite** feature flag is fail closed: missing, unreadable or disabled
state hides every module without deleting assignments.

## Resolution

1. Global flag off: hidden.
2. An explicit walk assignment wins over the city assignment.
3. A walk in `inherit` mode uses the city assignment.
4. With **Sponsor Invite** on, a city or walk with no assignment shows the
   invitation by default.
5. `empty` shows a compact city-aware invitation below **Hosted by**. Pricing is
   intentionally withheld until the visitor opens `/sponsor`, where the
   transparent Lightning packages are 1 walk for 21k sats, 2 for 42k sats, or
   the recommended 5 for 69k sats.
6. `sponsor` shows **Sponsored by**, the reusable Nostr profile card, the exact
   npub, the stored 1200 × 630 BitcoinWalk **Powered by** image generated from
   approved logo artwork, and the approved website link when present.

“Clear sponsor” signs an `empty` revision. “Hide” signs a `hidden` revision.
“Use city sponsor” signs an `inherit` revision. No audit record is deleted.
On walk pages, the resolved sponsor or invitation is rendered immediately below
the **Hosted by** section.

## Profile and website safety

The sponsor identity is a Nostr public key. The admin UI can read `website` from
the sponsor's signed kind-0 profile (NIP-24 metadata), but it accepts only a
public HTTPS URL without credentials, local names, IP literals or non-standard
ports. The reviewed URL is copied into the signed assignment. Public rendering
does not let a later profile edit silently redirect the approved sponsor link.

## Future commercial packages

BW-89 will add Lightning-zap booking and verifiable NIP-57 settlement. BW-90
will define fixed, transparent packages: one-walk Spotlight, a time-bounded city
Patron slot, and prepaid 3/6/12-walk series discounts. Optional directory and
post-walk acknowledgements require independent placement flags. BitcoinWalk
will not use behavioural targeting, tracking pixels, takeover ads, sponsor
control over editorial content, or any sponsor private key.

BW-16 is the accepted presentation and control baseline, not a frozen
commercial model. Its signed assignment payload is explicitly `version: 1`.
Later sponsorship capabilities must use an explicit compatible extension or a
new schema version and must never reinterpret an already signed v1 assignment.
Payment evidence, packages, discounts and new placements remain independently
reviewable under BW-89 and BW-90.

## Staging acceptance — 4 October 2026

- App `0.3.142` and relay policy `0.8.58` passed the automated suites and were
  accepted by the user on staging.
- Public relay read-back verified enabled feature-flags event
  `f8f54c7ab428cabb5cac9d011100ceef81c5d43556a23b34065a8af7108ec4de`.
- Public relay read-back verified the dedicated kind-30311 city assignment
  `9a71c9f27f70751d6f49bf7532b4e3ce0c218676f5092acc116340cf742bf2c4`
  in invitation (`empty`) mode.
- The earlier kind collision was corrected: kind 30308 remains reserved for
  feature flags and sponsorship assignments use kind 30311.
# Sponsor dashboard UX — 11 October 2026

App 0.3.267 makes approved logo assignments control OG/Twitter artwork
independently of the sponsorship module visibility
flag. Signed hidden assignments, occurrence expiry and payment coverage still
apply. Admin generation and public metadata share the same image renderer.
Each purchased walk has a signed Restore default city OG image control; this
clears its approved logo hash while preserving sponsor identity, website and
dates. It does not change another walk or delete uploaded assets. The logo can
be reviewed and approved again to reapply sponsored artwork. Social clients may
retain previously cached previews after a change.

Sponsored OG/Twitter metadata automatically reverts to the default city image
at the walk's start timestamp plus 43,200 seconds (12 hours), independent of the
scheduled end. The visible sponsor module still expires at the walk's end.
Dynamic metadata evaluates this cutoff on each request; no cron, extra signature
or deletion is needed. Signed clear/hidden decisions and payment coverage remain
authoritative. Archived images and signed approvals are retained for history.
Third-party social previews can remain cached until those services refresh them.

App 0.3.268 closes the asset activation gap found by the staging end-to-end
check. Generate / preview first promotes the reviewed pending logo into the
content-addressed approved asset store and verifies that the returned hash is
the exact order hash. Public walk metadata can then load that same immutable
asset. Existing signed approvals can be repaired by using Generate / preview;
no new sponsor payment or assignment approval is required.

App 0.3.269 accepts ordinary bounded SVG `id` attributes used by common vector
exporters, including IDs on groups and outlined paths. IDs remain inert because
scripts, styles, `use`, external resources, live text, fonts and animation stay
outside the accepted SVG subset; malformed IDs continue to fail before Sharp
rasterization.

Logo approval now also requests the authenticated OG composite generator after
the purchased-walk assignments pass relay read-back. The component stays visible
after approval and displays generation progress, an inline image preview and a
full-size image link. Already approved orders expose Generate / preview OG image.
Generation failure leaves approval intact and can be retried independently; a
failed image load is reported separately. This follow-up is included in staging
release 0.3.266; signed browser verification and production rollout remain.

App 0.3.265 adds exact-order logo review to Sponsors and payments. The super-admin
previews the uploaded hash and signs individual purchased-walk assignments.
Paid state, sponsor identity and artwork are refreshed before signing; conflicting
sponsors and hidden assignments require explicit resolution in Display settings.
Partially completed approvals can resume, and the UI distinguishes pending,
partial and complete approval. Unclaimed checkout rows are hidden in this sponsor
view while retained in the payment store.

The sponsorship workspace has Cities and Sponsors views with search and counts.
Cities group walks and their sponsors; Sponsors group placements and contain a
separate, sponsor-filtered asset library. Walk display controls expand inline.
App 0.3.281 uses a compact **All / Next walk / Upcoming / Past** toggle in both
views. From app 0.3.282, Next walk returns the earliest active or future walk
from every city with published walks—one result per city—while Upcoming includes
all active and future walks. Each row still shows its exact current status, and empty filtered
results are reported without changing any signed assignment. Connected ordinary
sponsors get the same hidden Sponsors / Payments page structure at
`/admin/sponsor`, but both tabs remain scoped by a fresh signature to orders and
walks claimed by that exact identity; no admin controls or other sponsors leak.
Hidden placements retain their previous sponsor association for management;
cleared placements do not. City default settings and walk overrides still use
the existing signed assignment protocol. The standalone Precedence section was removed.

The invitation section copies a public `/sponsor?city=…` link, or the general
sponsorship page when no city is selected. It does not send a DM or create a
signed invitation. Verified organizer invitations remain BW-92.
