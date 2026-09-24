# Organizer events — staged implementation

Current staging state (21 September 2026): organizer NIP-52 batch publishing,
read-back, exact event links, city redirects, the scheduled-walk list, and
publication-aware recurrence preview are deployed. The user confirmed the
scheduled-versus-missing count in app 0.3.11. The historical increment plan
below records the original safety gates; it is not a statement that those
features remain local. The preview counts distinct upcoming city dates, omits
already-published dates, flags multiple walks and changed times, and rechecks
the relay before signing. It still requires explicit organizer signatures and
does not promise unattended renewal or server-backed recurrence.

App 0.3.23 prepares an **Edit walk** action beside each unsigned draft in the review list. It changes only that occurrence's date, local time and meeting point while retaining its original series/date address. Recurring-plan edits are saved with that plan in the current browser; one-off previews remain in the current review only. Already published events cannot be edited through this control. Staging installation and signer-based acceptance remain pending.

App 0.3.25 combines saved and currently reviewed drafts, published upcoming/past events, delegated hosting assignments and retained cancellation markers into one chronological list per city. Upcoming and Draft filters are active by default; Past and Canceled can be enabled independently. Drafts have edit/review/skip/sign controls; upcoming organizer-owned walks have event, cancellation and delegation controls; hosted walks show their event without owner controls; past walks link to their event; canceled rows expose the original event ID for copying. The relay suppresses deleted event details, so older canceled rows use the cancellation timestamp and explicitly say that the original walk date is unavailable. Staging acceptance remains pending.

Individual walk cancellation is deployed on staging in relay 0.6.1/app 0.3.12: the
original event signer can publish a signed NIP-09 tombstone for their own walk;
the super-admin retains the existing moderation action. Another city editor
cannot cancel a different author's event. The relay hides the exact event ID
and retains the tombstone/history; other dates and city approval remain.
External copies may remain. A browser-local recurring plan may propose the
cancelled date again, but nothing republishes automatically. Public health and
route checks passed; signed human acceptance is still required.

## Agreed behaviour

City approval and occurrence publication are separate. Authorized organizers of an
approved city may publish individual NIP-52 kind-31923 occurrences. Recurrence is a
BitcoinWalk series expanded to individual events, not a claim of native NIP-52 recurrence.
Saturday is the default weekday, editable by the organizer. Default batch: 8 dates.
The city timezone is derived automatically from the approved map coordinates; device timezone is not authoritative. There is no organizer timezone input or confirmation checkbox.

## Increment 1 — implemented locally

- `/organizer/events`: load approved cities belonging to the current signer and preview dates.
- Weekly, fortnightly and one-off schedules; Saturday default; explicit skipped dates.
- Automatic local coordinate lookup (Memphis: America/Chicago), DST-safe conversion. Coordinates are not sent to a third-party timezone service. Uses pinned @photostructure/tz-lookup 11.7.0. Its boundary data is approximate; boundary-city cases need operator correction/exact lookup before broad production rollout, never a device-timezone fallback.
- Reject nonexistent/ambiguous DST times instead of silently moving the walk.
- Stable series/date occurrence identifiers across preview retries.
- 26-occurrence / 180-day limits; 15-minute to 12-hour duration.
- UTC day-tag helper covers the full interval, with exclusive end handling.
- No signature request, publication, permission change, database change or deployment.

The deployed organizer relay now advertises 0.6.0. A read-only audit found
`occurrence-v1` and approval/editor validation markers in its active executable.
On 21 September, the user signed one Memphis occurrence through the local web app:
event `a6fca16af9c0ab285b1d5e9fd862072cbc2c75d785b82f55a8b0096e68eb6758`.
The UI reported publication/read-back; an independent relay query verified its
signature, and the local event page rendered HTTP 200. The local publishing flow
is separate from the legacy admin calendar path. Address-scoped moderation and
publishing suspension remain open; do not claim the web publishing flow is live.

## Increment 2 — relay contract and moderation (required before publication)

### Rolling draft preparation — local increment

The organizer can explicitly save one recurring plan per identity/city in browser
localStorage. Connecting loads only plans for currently editable approved cities;
Review recalculates eight upcoming dates from the original recurrence anchor.
Missed weeks do not shift fortnightly parity. Skip tops up the eighth date; Pause
preserves the plan, and Resume recalculates the future window. No private keys,
signatures or published-state claims are stored. Storage failures are surfaced.

This is browser-only, login/review-time calculation, not a weekly background job.
It does not guarantee eight published events. Clearing browser data loses plans;
other devices/editors do not receive them. Server persistence, publication-aware
reconciliation, review/sign controls, reminders and automatic background draft
preparation remain pending. No forced signatures or dashboard lockout.

### Required relay changes

1. Version the occurrence format, separate from legacy d=cityId calendar records.
   Use stable d=seriesId:originalLocalDate; edits must retain that original identity.
   Each occurrence belongs to an explicit city UUID. Preserve its original author.
2. Check current city approval and current editor grant on writes, under the storage
   lock as well as preflight. Do not grant entitlement from a requested paid plan.
3. Persist provenance without tying every occurrence's validity to the latest city
   profile revision. City-description edits must not erase historical occurrences.
4. Separate read validation from new-write checks. Expired scheduling horizons and
   revoked publishing permission must not silently erase already-published history.
5. Add signed super-admin publication suspension (city or particular author) separately
   from hide/unhide moderation. The creator is currently protected in editor grants;
   suspension must still be able to stop a creator without deleting ownership records.
6. Moderate event addresses, not only individual event IDs, so an edited hidden event
   cannot reappear. Retain reasons/audit records; validate city/author/target scope.
7. Author cancellation/deletion uses the author's signature; super-admin suppression
   is BitcoinWalk relay policy, not a forged NIP-09 request from another author.
8. Enforce bounds, replay safety and atomic quota/permission checks at actual storage.
   Local regression: outsider, cross-city, revoked/suspended author, ownership spoof,
   duplicate/replay, hidden-address edit, restore, read/broadcast and restart behaviour.
9. Preserve every existing legacy calendar test. Prepare reversible staging relay
   upgrade and explicitly verify deployed capabilities before enabling the web button.

## Increment 3 — publishing and editing UI

- Preview exact event payloads; recheck identity/authority before and after signatures.
- Sign each occurrence with the organizer, retain signed events and per-relay outcomes
  for safe retries after partial success. Never regenerate already-acknowledged events.
- Read back accepted events and expose their individual links.
- Edit one occurrence or this-and-future with stable IDs; cancel/skip/pause/end series.
- Changing author cannot overwrite another author's address. Super-admin manages
  official presentation and relay policy, never impersonates an organizer.
- Bounded upfront signing only: no server nsec and no promise of unattended renewal.

## Increment 4 — public pages and acceptance

- Query organizer-authored occurrences (the current query only requests admin authors).
- Resolve organizer nevent links with verified city authority and moderation, not an
  arbitrary author allow-all. Query only configured relays; ignore untrusted relay hints.
- Render each occurrence's own details/date, not the legacy city startAt.
- City page: next occurrence, upcoming list, past archive; handle cancellations and
  superseded nevent versions explicitly. No automatic migration/double-publication.
- Human acceptance with Memphis organizer and super-admin; external client tests for
  discovery/update/cancellation. Do not promise deletion of third-party copies.

## Release boundary

Do not deploy an organizer publishing button before increments 2–4 pass together.
The preview is a local design/validation increment, not the completed publishing feature.
