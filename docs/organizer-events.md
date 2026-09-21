# Organizer events — staged implementation

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

The deployed organizer relay remains 0.5.0 and rejects organizer calendar writes.
The preview says this plainly. Do not wire publication through the legacy admin path.

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
