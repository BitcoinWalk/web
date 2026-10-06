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
after the browser closes. `/admin/sponsors/payments` lists payments by identity,
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
