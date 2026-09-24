# BitcoinWalk delivery backlog

Last reviewed: 23 September 2026
Tracking rule: keep this file current whenever an item changes status, scope, dependency, or verification result. The file is the maintained source; a separate Plan task is not automatically synchronized.

Latest acceptance: the user published Memphis organizer occurrences and confirmed the city redirect, exact event page, scheduled-walk list, form layout, and publication-aware recurrence preview. On 22 September, the user also confirmed individual-walk cancellation and one-walk delegation with encrypted invitation, nominee acceptance, restricted host permissions, and revocation. External-client discovery and propagation, broad moderation acceptance, and paid payment/entitlement/provisioning remain separate.

## Status key

🟢 `Done` — implemented and verified.  
🟠 `In progress` — active work has begun.  
🔴 `Blocked` — cannot proceed without an external decision, access, or service change.  
⚪ `Planned` — agreed work, not yet started.  
○ `Future` — retained for a later iteration.

## Authoritative staged scope

| Stage | Status | Notes |
|---|---:|---|
| 0. Product/protocol decisions | 🟠 In progress | Core free/paid model, relay tiers, admin identity, and Nostr signing are defined. Managed city signer and multi-editor rules still need implementation. |
| 1. Web foundation | 🟢 Done | Next.js app, validation, tests, linting, and production build. |
| 2. Nostr + relay connection | 🟠 In progress | Browser-extension signing, publish acknowledgements, NIP-42 auth, and relay reads work. The local app now targets verified Khatru staging; production relay migration remains. |
| 3. Public city pages | 🟠 In progress | Public Khatru staging reads, city redirect and exact occurrence pages are human-confirmed; hero image and copyable coordinates are present. The unified upcoming/past/draft/canceled list is prepared for staging acceptance. Production migration remains. |
| 4. Create + approve walks | 🟢 Done | Submit, relay authentication, super-admin approval, and private preview are working. Free and Paid-request submissions have both passed human testing; Paid selection is not entitlement. |
| 5. Organizer editing + permissions | 🟠 In progress | Organizer editing, retained revision handling, and local super-admin editor management are implemented. Real add/remove, cross-account, and edit/reject/reapprove acceptance remain. |
| 6. Discovery | 🟠 In progress | Homepage search, list/map, city links, and featured-card support are implemented against staging. Human map/search acceptance and confirmed featured entitlements remain. |
| 7. Nostr interoperability | 🟠 In progress | Organizer-owned NIP-52 occurrences are published and human-confirmed on staging, with exact `nevent` pages, individual cancellation and one-walk host delegation accepted. External-app discovery/propagation, address-scoped moderation and production migration remain. Free uses the shared relay; paid uses its provisioned city relay. |
| 8. Media + sharing | 🟠 In progress | Hero-image URL works. VPS upload, image generation, sponsor support, transparent BitcoinWalk logo, and OG image generation remain. |
| 9. Paid city bundle | 🟠 In progress | Free/Paid plan selection and signed tier requests are live on staging. Rustress payment, entitlement verification, NIP-05, LNURL 79/21 split, paid subdomain, and dedicated-relay provisioning remain. |
| 10. Security + launch | 🟠 In progress | Khatru staging, protected relay backup, global chat staging, and an isolated Austin dedicated-relay pilot exist. Production migration, security controls, monitoring, and full pilot acceptance remain. |

The table above defines the full BitcoinWalk scope. The backlog below breaks those stages into trackable work without narrowing the project to only the unpaid-walk flow.

## Current iteration backlog

### Organizer-owned events and recurrence — 20 September 2026

| ID | Stage | Item | Status | Dependencies / acceptance |
|---|---:|---|---|---|
| BW-37 | 7 | Organizer NIP-52 occurrence publishing | 🟠 In progress | Organizer-selected batch signing, relay ACK/read-back, and same-signature retries are deployed; the user reported eight Memphis walks published. Public event links work. External-client acceptance and broader moderation/suspension remain. |
| BW-38 | 7 | Recurring walk schedules | 🟠 In progress | Saturday default (editable), eight rolling browser-local drafts, one-off/weekly/fortnightly preview, skip/pause/resume, city timezone/DST and event-specific map are deployed. Publication-aware comparison and missing-date proposals are active on app 0.3.11 and human-confirmed. Server persistence and unattended scheduling remain. |
| BW-39 | 7, 10 | Event moderation and publishing suspension | 🟠 In progress | Local address-scoped event routing/moderation checks and tests added. Relay enforcement, signed hide/unhide, city/author publishing suspension, replay and human acceptance remain. Existing city creator cannot be removed from grants; suspension must cover this case. |
| BW-40 | 3, 7 | Next/upcoming/past city events and organizer deep links | 🟠 In progress | City and occurrence routes, current-or-next redirect with late-arrival grace, and organizer scheduled-walk list are deployed and human-tested. App 0.3.25 prepares one chronological list per city with Past, Draft, Upcoming and Canceled filters; only Upcoming and Draft are active initially. Contextual controls and hosted walks remain; staging acceptance remains. Existing tombstones lack the original event date, so historical cancellations are placed by cancellation date with a clear notice. External discovery, cancellation propagation and full historical-revision acceptance remain. Depends on BW-37/BW-39. |
| BW-46 | 7 | Edit a walk in the “In review” draft list | 🟠 In progress | App 0.3.23 adds **Edit walk** per unsigned draft for date, local start time, description and map pin. A saved recurring plan retains per-draft edits in this browser; an unsaved one-off preview retains them for the current review. The draft keeps its original occurrence address, checks future/horizon and city-date conflicts, and never alters published walks. Tests/build passed; staging installation and human acceptance remain. Depends on BW-37/BW-38. |

NIP-52 status (21 September): live relay 0.6.0 and the staging web app support
organizer-owned occurrence publishing and public event pages. Eight Memphis
occurrences were reported published by the user; city-root rotation and exact
event rendering were independently verified. Publication-aware recurrence
reconciliation is being prepared for staging. External-client discovery,
cancellation propagation and broader moderation acceptance remain follow-up work.

Homepage update (19 September): approved city directory implemented with search,
list/map, city links and featured paid-city/sponsor card support. Browser displays
four approved staging cities; 72 tests and TypeScript pass. Paid feature registry
is empty pending confirmed entitlements/partnerships; Madeira–Trezor is not presented
as a real sponsorship. Map/search human acceptance remains. See `public-directory.md`.

Editor-management update (19 September): local `/admin/editors` now provides
super-admin signed npub add/remove, protected creator access, exact-city stale
grant checks and relay ACK/read-back confirmation. 58 tests, TypeScript and lint
pass; initial browser screen verified. User reported the preceding organizer edit
flow works. Real add/remove and cross-account UI acceptance remain pending.
See `editor-management.md`; no new server deployment or real permission mutation.

Organizer editing update (19 September): `/organizer` is available locally with
registered-city selection, permission/account rechecks, date/description/map-pin/
hero URL editing and signed retained revisions. Admin review exposes revised
content; public pages show the approved description. 51 tests and TypeScript pass.
Human edit/reject/reapprove acceptance and editor-list management UI remain pending.
See `organizer-editor.md`.

Latest update (19 September; supersedes older organizer/snapshot notes below):
retained revision history is installed on Khatru organizer staging 0.3.0 and the
matching local web changes are activated. Approved content survives pending or
rejected edits; revocation still hides the city. 43 web tests, TypeScript and the
relay race suite pass. Initial human approval succeeded previously; the new
human edit/reject/reapprove cycle remains pending the organizer editing UI.
Public staging reads work; the older Zooid/public-read-blocked stage notes do
not describe the current local/staging environment. Production migration remains
outstanding. See `organizer-staging.md`.

Earlier organizer integration update: local `/start` and `/admin` target verified Khatru `relay-staging.bitcoinwalk.org`; creator registration precedes first approval, existing grants are preserved, and latest-decision/tag-bound resolution is implemented. Editing UI and approved-snapshot/history were subsequently implemented. Human retained-history acceptance and any legacy record migration remain outstanding. See `organizer-staging.md`.

Chat integration update (18 September): the separate Khatru staging chat and external Armada cross-client delivery have passed human testing; hosted Armada and signer transport were retired with a recoverable archive. This does not yet migrate the web app's city-record relay or the legacy production chat.

| ID | Stage | Item | Status | Depends on | Acceptance / latest verification |
|---|---:|---|---|---|---|
| BW-01 | 0 | Product and Nostr protocol foundation | 🟢 Done | — | City records, approval events, admin identity, free/paid model, and signing approach documented. |
| BW-02 | 1 | Web application foundation | 🟢 Done | BW-01 | Next.js app, validation, automated tests, linting, and production build pass. |
| BW-03 | 4 | Create a walk | 🟢 Done | BW-02 | Browser-extension signer, explicit city search, standard draggable map pin with preserved zoom, flexible local date/time, description starter text, and hero-image URL flow work. Staging 0.3.2 map fix confirmed by user. No `nsec` is stored. Autocomplete deferred to BW-31. |
| BW-04 | 2 | NIP-42 authenticated relay publishing | 🟢 Done | BW-03 | Browser-signed authenticated publishing works; the current local integration targets `wss://relay-staging.bitcoinwalk.org`. |
| BW-05 | 4 | Super-admin approval workflow | 🟢 Done | BW-04 | The designated BitcoinWalk super-admin can load, approve, and reject submissions; Radom was approved in the live relay test. |
| BW-06 | 3 | Authenticated city preview | 🟢 Done | BW-05 | `/preview/radom` can read the approved record through relay authentication. |
| BW-07 | 3 | City-page content | 🟢 Done | BW-06 | Hero image, walk details, map location, and copyable meeting coordinates are shown. |
| BW-08 | 2, 3 | Anonymous public relay reads | 🟠 In progress | Production migration | Approved city proposals are publicly readable on Khatru staging and public rendering selects the approved revision. Production relay migration and retained-history browser acceptance remain. |
| BW-09 | 6 | Public city directory | 🟠 In progress | BW-08 | Local homepage list/search/map and featured sponsor cards implemented; four approved staging cards verified. Human map/search acceptance and confirmed featured-city configuration remain. |
| BW-10 | 7 | Publish NIP-52 dated events | 🟠 In progress | BW-04, BW-05 | The admin calendar policy introduced in relay 0.4.0 remains part of the now-advertised 0.6.0 relay; explicit super-admin controls are at `/admin/calendar`. Human signed publication/read-back and external-app discovery acceptance remain. No automatic publication or external fanout. |
| BW-11 | 0, 5 | Organizer editing and editor allow-list | 🟠 In progress | BW-05 | Organizer editing reported working by user. `/admin/editors` add/remove UI implemented; 58 tests pass. Human editor grant/removal and cross-account UI acceptance remain. |
| BW-12 | 3, 7 | Public URL and Nostr deep-link resolution | 🟠 In progress | BW-08, BW-10 | Memphis organizer-signed occurrence links and exact event pages were human-confirmed on staging. Configured relays only and explicit unavailable states remain; paid subdomain routing and production acceptance are Stage 9/10 work. |
| BW-22 | 3 | Walk-event external Armada chat integration | 🟢 Done | App 0.3.33 restores **Join the community on Armada** on every published `nevent` page. Free cities use verified production group `13bc3a423b4f2954` on `chat.bitcoinwalk.org`; verified paid entitlements use their dedicated city relay/group and never fall back to global chat when provisioning is incomplete. Automated coverage, staging installation and visual acceptance on a real Memphis event passed on 23 September 2026. The production aliases `/join` and `/join-chat` were also externally verified; further alias simplification is tracked in BW-48. See chat-integration.md. |
| BW-23 | 9 | Trusted paid-chat provisioning registry | ⚪ Planned | BW-17, BW-20, BW-22 | Replace initial operator configuration with verified payment/provisioning records; store actual per-city relay/group IDs and test isolation before activation. |
| BW-24 | 10 | Cut over global chat and retire Zooid | 🟠 In progress | `chat.bitcoinwalk.org` now resolves explicitly to `.138` and serves the verified Khatru production group. The old wildcard still points to `.240`; the obsolete Zooid container and manager remain until the wider legacy-server migration safely retires them. |
| BW-45 | 10 | Rebuild `chat.bitcoinwalk.org` on Khatru | 🟢 Done | Production Khatru service has a separate key/database on `.138`, loopback port 3339, Caddy HTTPS/WSS and relay-signed group `13bc3a423b4f2954`. DNS, health, NIP-11, WSS, super-admin access and regular-user open joining passed on 23 September 2026. |

## Future backlog

### Austin dedicated-relay pilot — 18 September 2026

- Implemented isolated `/pilot/austin` fixture with the verified dedicated channel `d8006bee1ddd5b5f` on `austin-staging.bitcoinwalk.org`. Synthetic city identity, not an approved walk or payment record; no production configuration or signed records changed.
- Ordinary `/austin` continues to use the global staging chat. Pilot routing configuration is imported only by the pilot page; no default routing changes.
- Verification: 31 tests pass; production build passes; browser renders the dedicated link and staging notice. Lint retains two existing image warnings.
- Pending human acceptance: mobile regular-user join, bidirectional desktop/mobile delivery and reload history, non-member privacy, disposable-member removal/ban, and global-chat regression. Do not mark payment/provisioning automation or moderation acceptance complete on the strength of the preview alone.
- Invite-code creation (kind 9009) remains unsupported; open joining uses the direct channel link without a code.

| ID | Stage | Item | Status | Depends on | Notes |
|---|---:|---|---|---|---|
| BW-13 | 8 | VPS media upload | ○ Future | VPS access | Upload and retain hero images; replace the temporary URL-only path. |
| BW-14 | 8 | Image discovery/generation | ○ Future | BW-13 | Let organizers find or generate an appropriate hero image. |
| BW-15 | 8 | Open Graph image generation | ○ Future | BW-13, transparent BitcoinWalk logo | Use the hero image with the transparent BitcoinWalk logo overlay. **User action needed later:** provide the transparent PNG logo. |
| BW-16 | 8 | Sponsorship presentation | ○ Future | BW-11, BW-15 | Add sponsor data and approved display rules. |
| BW-17 | 9 | Paid city bundle: 21,000 sats | ⚪ Planned | Payment integration, BW-18/BW-19/BW-20/BW-23 | One-time lifetime price confirmed. Purchase/activation flow must provision city subdomain, dedicated relay/community, paid-only NIP-05 and city LNURL. Plan choice alone never grants entitlement. |
| BW-18 | 9 | Rustress payment and 79/21 split | ○ Future | BW-17, Rustress environment | Send 79% to creator LNURL and 21% to BitcoinWalk automatically. |
| BW-19 | 9 | NIP-05 identity provisioning | ○ Future | BW-17 | Provision the selected city identity policy. |
| BW-20 | 2, 9 | Dedicated relay provisioning with Khatru | ○ Future | BW-17, VPS deployment | Spin up and manage paid-city relays. |
| BW-21 | 10 | Security and launch operations | ○ Future | BW-08 through BW-20 as applicable | Rate limits, abuse controls, backups, monitoring, deployment, and pilot-city launch. |
| BW-48 | 3, 10 | Simplify global community join aliases | ○ Future | BW-22, production-domain cutover | Make `https://bitcoinwalk.org/join` and `https://join.bitcoinwalk.org` stable aliases for the global Armada community, while retaining `https://chat.bitcoinwalk.org/join` and older links for compatibility. Acceptance: all aliases redirect to the same verified production group over HTTPS, walk pages use the preferred canonical URL, and automated checks prevent redirect loops or broken legacy links. |
| BW-49 | 3 | Meeting-pin weather on walk pages | 🟠 In progress | BW-10, public event pages | App 0.3.34 introduced cached server-side Open-Meteo forecasts for the signed event meeting pin and start time, without storing changing weather in Nostr or exposing visitor identity. App 0.3.35 accepts provider-null values outside the selected event hour after the Warszawa page exposed this valid-response edge case. The compact top strip includes a privacy-safe community action; required CC BY attribution is in the footer. Automated tests, local Memphis/Warszawa rendering and build pass; staging 0.3.35 installation and Warszawa acceptance remain. |

## Adding a backlog item

| ID | Stage | Item | Status | Remaining / acceptance |
|---|---:|---|---|---|
| BW-44 | 5, 7 | Unified role-aware /admin dashboard | 🟠 In progress | User confirmed the dashboard and combined Walks view. App 0.3.30 consolidates super-admin city list, request review, profile defaults and editor access under one Cities entry, preserving old approval anchors; the city list reads occurrences only after city selection. The separate hosting entry is removed. Staging and full cross-role signed acceptance remain; large-inventory pagination remains future work. See `admin-dashboard.md`. |
| BW-47 | 4, 5, 7, 10 | Review-gated first walk at city registration | 🟠 In progress | App 0.3.31 and relay 0.8.0 prepare one flow that signs an initial NIP-52 walk plus city revision, hides the walk until exact super-admin approval, then exposes it in the organizer dashboard and city redirect. Guide has separate durable review and verified-live DMs. Relay limits new identities to one pending city, plus per-identity/network submission windows. Pending staging deployment and signed acceptance: submit fresh city, receive admin DM, approve, verify first walk and organizer live-link DM, then confirm duplicate/restart behavior. |

| ID | Stage | Item | Status | Remaining / acceptance |
|---|---:|---|---|---|
| BW-43 | 7 | Delegate one walk to a colleague | 🟢 Done | Staging acceptance completed 22 September: updated encrypted invitation was received in Armada; nominee accepted and saw the walk under **Walks I’m hosting**; nominee had no edit, cancel or onward-delegation controls; other series dates stayed intact; organizer revocation worked. App 0.3.22 contains the accepted DM wording. Production rollout remains part of launch operations. See `co-organizers.md`. |

| ID | Stage | Item | Status | Remaining / acceptance |
|---|---:|---|---|---|
| BW-42 | 4, 10 | BitcoinWalk Guide approval DM notifications | 🟠 In progress | Separate notification-only worker installed and enabled; dedicated bot key generated on VPS; real encrypted approval and delegation DMs arrived in Armada; public kind-0 bot profile was published. The 0.3.31 worker adds a separate verified-live DM to a newly approved organizer without granting Guide approval authority. Pending staging acceptance, duplicate/restart checks and mobile push behavior. NIP-05 `guide@bitcoinwalk.org` is not provisioned; AI support deferred. |

| ID | Stage | Item | Status | Remaining / acceptance |
|---|---:|---|---|---|
| BW-41 | 7 | Rolling eight upcoming walk drafts | 🟠 In progress | Browser-local saved recurrence, login/review catch-up, stable IDs, skip top-up and pause/resume are deployed. App 0.3.11 counts distinct future dates, filters already-published dates, flags conflicts and rechecks before signing; the user confirmed scheduled/missing preview. No automatic signatures, server persistence or eight-published-events guarantee. |

## Admin lifecycle and invitations — 19 September 2026

| ID | Stage | Item | Status | Dependencies / acceptance |
|---|---:|---|---|---|
| BW-25 | 5, 10 | Unified moderation: reject, approve/disapprove, restore and free-city archive | 🟠 In progress | Local `/admin` implemented with exact signed decisions, stale-state checks, confirmations and relay read-back. Human acceptance pending. Archive is reversible retained revocation; no infrastructure deletion. |
| BW-26 | 7, 10 | Cancel individual published walk | 🟢 Done | Staging acceptance completed 22 September: organizer and super-admin cancelled individual test walks, the memorable city URL immediately rotated to the next `nevent`, other dates stayed intact, and another city editor could not cancel another author's walk. Relay retains signed tombstones/history. External-client propagation remains tracked under BW-37/BW-40; third-party copies may remain. |
| BW-27 | 4, 5 | Personal organizer invitations | 🟠 In progress | NIP-17 preview, signed inbox discovery, extension encryption/signing, recipient and sender copies implemented. Public registration URL and compatible signer/inbox setup needed; human delivery acceptance pending. Registration remains open and ordinary approval required. |
| BW-28 | 9, 10 | Paid-tier entire-relay deletion | ⚪ Planned | BW-20/BW-23 verified infrastructure inventory, backup/recovery plan, typed target confirmation, signed explicit warning and validated server execution. Disabled in local admin. Never inferred from absence in the paid registry. |
| BW-29 | 9, 10 | Transfer paid relay to owner node | ⚪ Planned | Verified export/import, secure relay-identity transfer, synchronization/cutover and rollback; package relay plus city dashboard for Umbrel/Start9. No source teardown until destination verification. |
| BW-30 | 9 | Local merchandise in city dashboard | ○ Future | BW-29 and separate commerce/payment/fulfilment design. No automatic selling permission granted by an invitation. |
| BW-33 | 0, 4 | Organizer identity onboarding | 🟠 In progress | Release 0.2.0 public health verified. Existing vs dedicated identity, signer-owned key creation/backup guidance, exact signing and account-switch guards. No nsec handling or automatic profile writes. Superseded in layout by BW-35; real signer acceptance remains. Profile renaming stays in the user's Nostr client. |
| BW-35 | 4, 9 | Two-step registration and plan choice | 🟠 In progress | Walk details first, then signer and Free/Paid selection are live. User successfully submitted Free and Warsaw Paid requests. Paid is 21,000 sats once/lifetime; paid-only NIP-05/LNURL and ongoing 79/21 split remain unprovisioned. Signed `requestedTier` is an admin-visible preference, never entitlement; approval does not activate Paid. Payment verification, provisioning and alternate-identity acceptance remain. |
| BW-36 | 5 | Persistent admin city-walk link | 🟢 Done | BW-05, BW-07. Release 0.3.1 adds Open BitcoinWalk [city] beside approved managed cities, with a separate-tab link and unavailable explanation for non-public cities. User confirmed it works. Tests, TypeScript, build and lint passed. |
| BW-34 | 0, 4 | Optional profile rebranding and mobile onboarding | ○ Future | Separate current-profile lookup, field-preserving preview and explicit signature to rename a chosen identity; warn changes affect the account across Nostr. Mobile/remote signer connection needs its own supported flow. Never generate/store nsecs in BitcoinWalk. Depends on BW-33 acceptance. |
| BW-31 | 4 | Restore city autocomplete with a suitable provider | ○ Future | User approved temporary explicit Search city. Public Nominatim prohibits autocomplete. Select a compatible hosted or self-hosted provider with appropriate limits before restoring type-ahead; keep single City field and map selection. |
| BW-32 | 10 | Public staging app deployment | 🟢 Done | Public staging is active; 0.3.11 recurrence preview, 0.3.12 cancellation and 0.3.22 delegation/DM wording have been human-tested. Later 0.3.23–0.3.25 walk-list changes are prepared but still need staging installation and acceptance. CI packages and smoke-tests standalone archives but does not deploy them. Production/legacy cutover remains separate. |

Calendar publish/delete acceptance: the user reported the admin workflow completed smoothly; individual organizer/super-admin cancellation was subsequently human-tested on staging under BW-26. Broader restore/republication and external-client propagation checks remain separately tracked.

Add a row with the next unused `BW-` number, a short outcome-focused title, initial status `Future`, known dependencies, and a testable acceptance condition. In the **Plan** task, you can simply say, for example: “Add BW-22: calendar export; depends on BW-10.” It will be placed, prioritised, and kept in sync here.
