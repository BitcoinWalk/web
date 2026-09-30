# Unified dashboard

## BW-25 restore regression — 29 September 2026

The user's signed retry on app 0.3.88 exposed a separate relay bug: initial approval's future-date horizon was reapplied when restoring an already released past walk. Relay 0.8.55 permits historical timing only when a retained, signature-verified super-admin approval matches the exact city, revision and initial event. Shape/content, one-hour duration, ownership, grants, and cancellation/read suppression remain enforced. New past submissions and approvals without exact prior release remain rejected. Race-enabled tests and vet passed, including wrong-city/revision/event/author and rejected-only history. The operator installed relay 0.8.55 successfully, with backup `/var/backups/bitcoinwalk-relay-initial-restore-0.8.55.rPeJmN`. On 29 September 2026 the user confirmed Larnaca disapprove/restore, archive/restore, organizer permission denial and stale-screen protection all passed and authorized closing BW-25.

Larnaca's signed history confirmed disapproval of its original submission. The restore button constructed an approval without that revision's initial-walk reference, which the relay requires. App 0.3.88 restores the exact reference from the signed revision and retains the same revision's previous approved hero image and slug. It does not create or sign a new occurrence, change editors, or bypass the relay's cancellation rules. Automated lifecycle tests cover disapproval and archive followed by restore, metadata preservation, and rejection of metadata from another revision. Feedback is also displayed beside the action buttons; hidden events are explained separately from archive/infrastructure warnings. User-signed restoration and public-page acceptance passed. Read-only verification confirmed the exact original event remained publicly readable and classified as past (26 September); no replacement walk was created.

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

Only the super-admin sees or can open `/admin/cities` through the dashboard. Organizers use `/admin/walks`; legacy `/organizer` now redirects there. The overview city-count link also points organizers to Walks. This is an interface restriction, not a relay policy change: authorized organizer keys may still sign city revisions through other clients. The optional replacement landscape URL is part of the published-walk **Edit walk** form and uses the same **Sign and save changes** action; it does not expose city moderation or permission controls, and the city-default replacement remains pending until super-admin approval. The retired `/admin/appearance` URL redirects to Walks.

## App 0.3.27 — permission-test city selectors

The city selectors omit the exact names “Organizers permission test” and “Protected Editor Isolation Test”, including the shared dashboard selector, Add a walk form and super-admin city-profile selector. This is UI filtering only: their relay records and scheduled walks are not deleted or archived.

## App 0.3.28 — dashboard header

The header welcomes the connected user and shows their npub, public profile name and avatar when available (with a fallback for missing metadata). It reads kind-0 metadata from the app's configured public profile relays and does not sign or publish. The former refresh/switch-identity control and public-site link are removed; Connect signer appears only while disconnected, and Disconnect remains available. A top-right status dot is grey when disconnected, orange during connection, green when connected and red with a description on connection/discovery errors. The global city selector is shown only to the super-admin; organizers and hosts use the city-grouped Walks list and the Add a walk form.

## App 0.3.29 — hosting in Walks

The separate My hosting assignments navigation item is removed. `/admin/hosting` redirects to `/admin/walks` for old links. The overview's hosting metric and preview also point to Walks. Walks continues to list accepted hosting assignments alongside owned upcoming/past events, without adding author-only actions to hosted rows. Hosted-walk loading is independent of city-editor discovery so a host-only account can still see its assignments if that discovery fails. No delegation or relay permissions change.

## App 0.3.30 — consolidated Cities administration

The super-admin sidebar has one Cities entry with four focused views: City list, Review requests, Profile, and Editors. The separate Approvals, City moderation, and City permissions navigation entries are gone. Old `/admin/approvals`, `/admin/moderation`, and `/admin/editors` links redirect to the matching Cities view; submission anchors and query parameters are preserved. Guide's older `/admin#submission-ID` links also route directly to Review requests.

## App 0.3.90 — focused CMS modules

The super-admin sidebar now exposes three adjacent, task-focused modules. **Cities** contains the city inventory, review requests, and city-profile editing. **Walks** contains occurrence scheduling plus walk/city/organizer publishing moderation. **Organizers** contains city-editor access and organizer invitations. This is an information-architecture change only: signer, role, city-editor, approval and relay-policy boundaries are unchanged.

Old `/admin/moderation`, `/admin/editors`, `/admin/invitations`, and the corresponding former `?tab=moderation` or `?tab=editors` Cities links redirect to their new modules while preserving the selected city and fragment. Organizers retain their role-specific Cities and Walks entries; the new Organizers administration module remains super-admin-only.

City list reads city state first and reads NIP-52 occurrences only for the selected city. It keeps approve/restore, disapprove, free-city archive and exact published-walk cancellation with existing confirmations and relay read-back. Review requests keeps approve/reject and the required creator-registration signature; paid requests remain preferences, not entitlements. Editors keeps signed city-wide add/remove with creator protection. Profile edits are limited to city description, hero image, and default meeting point; the legacy city start date is preserved but no longer editable in this screen because actual walks are managed per event in Walks. Redundant breadcrumbs and cross-links are removed. Relay policy, keys, records and published events are unchanged. Staging and cross-role human acceptance remain pending.

## App 0.3.92 — reusable user identity and organizer directory

The repeated identity display is now one reusable Nostr user component. It resolves signed kind-0 metadata across the configured public profile relays and shows a safe HTTPS avatar, username, npub, NIP-05 and `lud16`/`lud06` Lightning destination. NIP-05 is checked live against the identifier's well-known document; a displayed identifier is labelled **verified** only when it maps to the exact npub. Every available text value has a small copy control. Missing or unsafe profile fields remain visibly unavailable rather than being inferred.

The dashboard header uses the compact version. **Organizers → All organizers** uses the full version and groups creators and added editors by city from the latest signed city grants; the super-admin is not presented as an ordinary organizer merely because it has global access. Profile lookup is batched for the directory. The invitation/editor/delegation identity surfaces reuse the same component. **Walks** now has only its module-level title.

App 0.3.92 was activated on staging on 29 September 2026 through the non-root deployment helper. Artifact SHA-256: `d303edbd570fd5cec703df3a3c9e3ac8db69f31adc684282c959449c78dcac7d`; deployment evidence: `/home/bitcoinwalk/backups/app-staging-deploy.IAp7xc`; active release: `/opt/bitcoinwalk-app-staging/releases/0.3.92-d303edbd570f`. Packaged smoke, 380 tests, source lint, production build, public health and both changed route checks passed. Signer-connected profile, copy-control, city-grouping and responsive-layout acceptance remains under BW-74.

App 0.3.93 tightens the component visually: the username is the larger bold primary value without a redundant label; NIP-05 and its verified, unverified or checking state share that line. Copy buttons now replace the copy glyph with visible **✓ Copied** feedback, or **! Retry** when clipboard access fails, then reset automatically. The same feedback remains announced to assistive technology. It was activated on staging on 30 September 2026 through the non-root helper. Artifact SHA-256: `35754b9cbefa98960918ecbcd333afe169f0ff6219a815c094c900a1e17706ba`; deployment evidence: `/home/bitcoinwalk/backups/app-staging-deploy.rftw0r`; active release: `/opt/bitcoinwalk-app-staging/releases/0.3.93-35754b9cbefa`. All 382 tests, production build, packaged smoke, public health and the organizer route check passed.

App 0.3.94 removes the global **City / All available cities** selector from the CMS header. City selection remains local to the modules that need it. The first header row now aligns **Welcome to your dashboard!**, Connect/Disconnect and the connection-status dot; the reusable identity component remains directly underneath. It was activated on staging on 30 September 2026 through the non-root helper. Artifact SHA-256: `045490f3297a160df000db27bb6ef161939fc17839953860ebf43e4388dc6644`; deployment evidence: `/home/bitcoinwalk/backups/app-staging-deploy.uj14ow`; active release: `/opt/bitcoinwalk-app-staging/releases/0.3.94-045490f3297a`. All 382 tests, production build, packaged smoke, public health and dashboard route checks passed.

## App 0.3.107 — focused request queue

**Requests** is now a separate super-admin sidebar module rather than a Cities tab. Its label includes the pending request count loaded from the signed relay directory during login and updates immediately after approval or rejection. Old `/admin/approvals`, `/admin#submission-ID`, and `/admin/cities?tab=requests` links continue into the same request and preserve submission anchors.

Each city card opens with a compact new-city/change summary, date, meeting place and plan state. Full signed field changes and technical identifiers remain under a disclosure for audit. A ⚡ marker means the private payment service confirms durable Pro entitlement; a selected Pro plan or pending invoice is labelled pending and never receives the marker. If private payment lookup fails, request review remains available and markers fail closed rather than guessing.

App 0.3.107 was activated on staging on 30 September 2026 through the ordinary `bitcoinwalk` deployment account. Artifact SHA-256: `800d56b6f7783e75de268a917f457a86ed5bb4c5758f5dfc4c2d531333f22081`; deployment evidence: `/home/bitcoinwalk/backups/app-staging-deploy.X5glNo`; active release: `/opt/bitcoinwalk-app-staging/releases/0.3.107-800d56b6f778`. All 447 tests, changed-source lint, production build, packaged smoke, public health and the new Requests route passed. Signer-connected Basic/Pro marker and live sidebar-count acceptance remain under BW-75.

App 0.3.108 extends the sidebar badges without changing permissions. Super-admin sees **Cities (n)** for currently approved cities and **Upcoming walks (n)** for unique active/grace/upcoming public occurrences. Organizer sees **My walks (n)** for the unique future occurrences visible on that page, including accepted hosting assignments without double-counting. A failed or incomplete relay read shows `?`; it is never converted to zero. Approving or rejecting a city request triggers a fresh menu inventory read.

App 0.3.108 was activated on staging on 30 September 2026 through the ordinary `bitcoinwalk` deployment account. Artifact SHA-256: `6b1c83da55b0248c404bff4de783c24e19b4dd9299d46384b2f15dace0e90fef`; deployment evidence: `/home/bitcoinwalk/backups/app-staging-deploy.7nAcUt`; active release: `/opt/bitcoinwalk-app-staging/releases/0.3.108-6b1c83da55b0`. All 451 tests, source lint, production build, packaged smoke, public health and dashboard route checks passed. Signer-connected count acceptance remains under BW-75.

## App 0.3.109 — relay directory deferred

The organizer **Relay directory** entry and direct role access are hidden while its task model and language are redesigned under BW-76. The existing implementation is retained for future rework; no relay records, defaults or policies are changed by hiding the screen.

For 0.3.17 acceptance: connect once, inspect overview counts, select a city and navigate between Walks/Cities/Hosting. Confirm the filter persists and each screen loads without a second connect click. Test All available cities, a host-only identity, and a relay outage. Refresh overview after signed changes; counts are not live.

## Content administration

The super-admin sidebar includes **Content** at `/admin/content`. It edits the
homepage's editorial copy and manages additional static pages. Each change is a
retained, super-admin-signed relay revision; no server-held signing key is used.
The homepage remains fixed at `/`. Other page URLs may be changed, with the old
published URL resolving to the current one. Application routes and BitcoinWalk
city slugs are reserved and cannot be claimed by content pages. Organizers and
hosts cannot see or open this section. Dynamic directory cards, maps, walks and
other application data remain generated from signed records rather than being
editable HTML.

The same section contains signed feature flags. `Paid tier registration`
defaults off when no valid setting exists or the relay cannot be read. While
off, `/start` presents the Free plan without a plan chooser and the relay also
rejects organizer-crafted Paid requests. Enabling it requires the super-admin
signature and restores the Free/Paid comparison and selection in step 2.

## App 0.3.18 — overview actions

User confirmed the 0.3.17 dashboard looks good. This app-only follow-up uses the same reads to show up to five current/upcoming managed walks and five accepted hosting assignments, earliest first, with direct event links and explicit time zones. Past walks are omitted; active and late-arrival status remains visible.

Super-admin gets exact-revision approval links. City editors/admins get a scheduling prompt only for approved cities whose completed calendar reads returned no current/upcoming events. Any failed or saturated managed-calendar read suppresses that action list instead of suggesting false gaps. An unrelated member only sees the hosting overview, not city publishing/moderation controls.

Acceptance: select Memphis and inspect upcoming dates/links; compare against Walks. Check an approved city without events, a host-only account and super-admin pending approvals. No signature should be requested merely for viewing the overview. Refresh after changes; these are read snapshots, not live subscriptions.
