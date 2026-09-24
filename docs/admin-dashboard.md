# Unified dashboard

App 0.3.16 consolidates organizer and super-admin screens under /admin. Relay 0.7.1 is unchanged. The left sidebar becomes a collapsible mobile menu; the right panel displays the selected section.

Routes: /admin overview, /admin/walks, /admin/hosting, /admin/cities, /admin/approvals, /admin/moderation, /admin/editors, /admin/invitations, /admin/accept-invitation.

Super-admin sees all navigation. From app 0.3.26, Cities is super-admin-only; a connected city creator/editor sees Walks and Hosting. Other identities can view their hosting assignments without receiving city permissions. The nomination acceptance page can be opened without first connecting the shell. Role discovery failures leave the shell disconnected with an error rather than assuming no permissions.

The shell checks identity on focus and every 15 seconds while connected, clears/remounts child screens on reconnect/disconnect and binds signing to its selected identity. Signer changes before/during signing are rejected. Existing per-action identity checks and relay-side permission enforcement remain the security boundary. Navigation visibility never authorizes a write.

Old organizer routes redirect while preserving query strings and fragments. /admin/calendar redirects to /admin/walks; its obsolete one-city/one-event publishing controls are removed. Old Guide links /admin#submission-ID forward to /admin/approvals with the anchor intact. Existing nevent links, historical calendar records and delegation records are untouched.

## Included

- Shared role-aware navigation and responsive layout.
- Separate approvals, moderation, city permissions and organizer invitations.
- Dedicated hosting assignments route; authoring controls remain separate.
- Existing feature screens retained; read-only loads now run automatically after connection. Manual refresh and explicit signing controls remain.
- Legacy invitation and review links supported.

## App 0.3.17 — shared context and data

- One city selector in the header persists across sections. All cities is the default. Switching cities remounts the section and confirms before discarding open forms.
- Walks, hosting, city details, approvals, moderation and editor records load automatically when entered with a connected identity.
- The selector includes directly authorized cities and accepted hosting assignments. Hosting never adds city-editor permissions. Selector discovery failures are shown as incomplete, not empty.
- Overview shows approved managed cities, current/upcoming walks, accepted current/upcoming hosting assignments, and super-admin pending submissions. These are relay snapshots, not live subscription counts. Refresh reloads them.
- Failed or saturated reads show Unavailable, never a fabricated zero. City authorization discovery now fails explicitly at its bounded read limit.
- Invitations, acceptance, publication and moderation still require explicit user actions and signatures.

## Next stages

- Pagination for large city inventories.
- Signed acceptance testing across super-admin, editor, delegate, unrelated npub; browser/mobile UX polish.

## Acceptance

Connect each identity and inspect sidebar visibility. Directly enter a restricted route as an organizer: it should show Section unavailable. Switch signer accounts while a form is open: the previous screen must clear on detection, and no stale signature may publish. Follow an old invitation query URL and a Guide submission fragment link. Confirm scheduled walk cancellation/delegation and approvals still use their original signers and relay policies.

DM delivery remains a separate open issue. This release does not change the Guide worker, relay binaries, databases, DNS, Caddy or legacy website.

## App 0.3.26 — Cities visibility

Only the super-admin sees or can open `/admin/cities` through the dashboard. Organizers use `/admin/walks`; legacy `/organizer` now redirects there. The overview city-count link also points organizers to Walks. This is an interface restriction, not a relay policy change: authorized organizer keys may still sign city revisions through other clients. The Cities form uniquely offers city-profile editing (description, hero image, default meeting point, and default date/time), which is no longer available in the organizer dashboard. A separate Walks-based editor would be needed if those actions should return later.

## App 0.3.27 — permission-test city selectors

The city selectors omit the exact names “Organizers permission test” and “Protected Editor Isolation Test”, including the shared dashboard selector, Add a walk form and super-admin city-profile selector. This is UI filtering only: their relay records and scheduled walks are not deleted or archived.

## App 0.3.28 — dashboard header

The header welcomes the connected user and shows their npub, public profile name and avatar when available (with a fallback for missing metadata). It reads kind-0 metadata from the app's configured public profile relays and does not sign or publish. The former refresh/switch-identity control and public-site link are removed; Connect signer appears only while disconnected, and Disconnect remains available. A top-right status dot is grey when disconnected, orange during connection, green when connected and red with a description on connection/discovery errors. The global city selector is shown only to the super-admin; organizers and hosts use the city-grouped Walks list and the Add a walk form.

## App 0.3.29 — hosting in Walks

The separate My hosting assignments navigation item is removed. `/admin/hosting` redirects to `/admin/walks` for old links. The overview's hosting metric and preview also point to Walks. Walks continues to list accepted hosting assignments alongside owned upcoming/past events, without adding author-only actions to hosted rows. Hosted-walk loading is independent of city-editor discovery so a host-only account can still see its assignments if that discovery fails. No delegation or relay permissions change.

## App 0.3.30 — consolidated Cities administration

The super-admin sidebar has one Cities entry with four focused views: City list, Review requests, Profile, and Editors. The separate Approvals, City moderation, and City permissions navigation entries are gone. Old `/admin/approvals`, `/admin/moderation`, and `/admin/editors` links redirect to the matching Cities view; submission anchors and query parameters are preserved. Guide's older `/admin#submission-ID` links also route directly to Review requests.

City list reads city state first and reads NIP-52 occurrences only for the selected city. It keeps approve/restore, disapprove, free-city archive and exact published-walk cancellation with existing confirmations and relay read-back. Review requests keeps approve/reject and the required creator-registration signature; paid requests remain preferences, not entitlements. Editors keeps signed city-wide add/remove with creator protection. Profile edits are limited to city description, hero image, and default meeting point; the legacy city start date is preserved but no longer editable in this screen because actual walks are managed per event in Walks. Redundant breadcrumbs and cross-links are removed. Relay policy, keys, records and published events are unchanged. Staging and cross-role human acceptance remain pending.

For 0.3.17 acceptance: connect once, inspect overview counts, select a city and navigate between Walks/Cities/Hosting. Confirm the filter persists and each screen loads without a second connect click. Test All available cities, a host-only identity, and a relay outage. Refresh overview after signed changes; counts are not live.

## App 0.3.18 — overview actions

User confirmed the 0.3.17 dashboard looks good. This app-only follow-up uses the same reads to show up to five current/upcoming managed walks and five accepted hosting assignments, earliest first, with direct event links and explicit time zones. Past walks are omitted; active and late-arrival status remains visible.

Super-admin gets exact-revision approval links. City editors/admins get a scheduling prompt only for approved cities whose completed calendar reads returned no current/upcoming events. Any failed or saturated managed-calendar read suppresses that action list instead of suggesting false gaps. An unrelated member only sees the hosting overview, not city publishing/moderation controls.

Acceptance: select Memphis and inspect upcoming dates/links; compare against Walks. Check an approved city without events, a host-only account and super-admin pending approvals. No signature should be requested merely for viewing the overview. Refresh after changes; these are read snapshots, not live subscriptions.
