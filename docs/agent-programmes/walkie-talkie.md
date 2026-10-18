# Walkie Talkie improvement programme

Owner: existing pinned Walkie Talkie task. Read ../agent-programme.md for shared boundaries. Baseline established 16 October 2026; measured values remain unknown until device evidence is collected.

## Charter

Own the companion app experience: city selection, canonical walk page, confirmed city/Global membership, account/signing, standard DMs, zaps and optional notifications. Preserve shared public NIP-29 chat independently of dedicated Armada relays. Android prioritizes Pixel/GrapheneOS with Amber and Zapstore distribution; maintain iOS readiness and test it independently. BLE discovery and private encrypted mesh remain separate later gates, not substitutes for online reliability.

The current task is already Walkie Talkie; no duplicate task is required. Web backend contracts and release integration are Development-owned. Support supplies redacted real-world cases and confirms the user's resolution; mobile transport defects belong here.

## Skills and learning sources

Use better-ui and emil-design-eng for relevant UI work, targeted codex-security review for identity/deep-link/cryptographic changes, and repository architecture, design and release instructions. Read exact-version Expo documentation before code changes, as required by the mobile AGENTS.md. Consult current primary NIP specifications when implementing protocol behavior.

Proposed skill: nostr-mobile-interoperability. Package only after validated device runs establish repeatable inputs, supported signers, diagnostic boundaries, expected evidence and recovery steps. A second potential skill, mobile-release-device-acceptance, should come from actual Zapstore/iOS release rehearsals; do not label it installed today.

## Weekly improvement loop

During each active weekly review, select one top failed user journey from Support or device acceptance. State a measurable hypothesis; reproduce on the affected device and a control environment; fix one cause; retest sign-in, account isolation and recovery. Record build/commit, OS/device, signer version, conditions, result and limitation. Feed confirmed reusable behavior into the appropriate design/architecture/protocol document, not a duplicated generic instruction file.

Maintain a redacted evaluation ledger with case ID, expected outcome, actual result and artifact reference. Turn recurring procedures into a skill candidate only after the shared evaluation/versioning gate. No timer or unattended device testing is installed by this programme.

## Scorecard

| Measure | Definition | Baseline |
|---|---|---|
| Sign-in completion | Successful correct-account connections / deliberate attempts, reported separately by signer and OS | Not measured |
| City onboarding completion | Confirmed selected-city and chosen Global membership / consenting onboarding attempts | Not measured |
| DM interoperability | Passed send/receive scenarios / fixed tested-client matrix; show unsupported combinations | Not measured |
| Notification delivery | Device-observed notifications / accepted eligible test notifications, with foreground/background distinction | Not measured |
| Recovery correctness | No duplicate sends, cross-account drafts or lost confirmed membership across fixed restart cases | Not measured |
| Performance | Time to usable city screen and bounded-history scroll responsiveness on named reference devices | Not measured |
| Support recurrence | Reopened mobile cases / resolved mobile cases over the review window | Not measured |

Do not infer human readership from relay acknowledgement or app installation from a link click. Report sample sizes and unavailable iOS/device access.

## Evaluation pack

1. New Pixel/GrapheneOS user chooses Madeira, connects Amber, consents to city/Global join; show memberships only after confirmation.
2. Existing account opens the same invitation twice: retain city, no duplicate membership or identity.
3. NIP-46 user cancels signing and resumes; same selected city, no false connected state.
4. Switch accounts with drafts/attachments and pending requests: no cross-account messages or host permissions.
5. Receive one standard Guide NIP-17 message with valid city deep link, then restart/reconnect: render once.
6. Exchange standard NIP-17 text with an independent client using both supported local and remote signer paths; reject malformed or misaddressed envelopes.
7. Relay outage after publication acknowledgement: recover history without inventing delivery/read status or resending a logical message.
8. Installed and uninstalled app links on Android/iOS: preserve selected city, provide browser fallback, ignore forged role claims.
9. Notifications denied, revoked or background-delayed: explain state, keep app usable, avoid lock-screen private content.
10. BLE later: two consenting phones within the same verified walk window/geofence; reject drive-bys and stale/replayed advertisements; do not expose npub/location or imply offline payments.

## First four iterations

1. Inventory current app build, protocol matrix and device access. Reconcile BW-125/BW-128/BW-133/BW-149 ownership. Establish signer and membership baselines.
2. Fix the highest-value signer/DM recovery issue and run Pixel acceptance. Review Guide inbound/outbound contract with Support and Development.
3. Run the staged Guide support round trip on the named test accounts after backend intake exists, then iOS or record its missing-device gate. Keep real user contact out of synthetic tests.
4. Evaluate the fixed scenarios and promote the first validated interoperability runbook/skill candidate. Prepare scoped release acceptance with Development; Support verifies resolution.

## Handoff to Support and Development

Provide case ID, environment, app build, device/OS/signer, canonical city ID, verified envelope metadata as permitted, reproduction, expected/actual result and next owner. Never attach private keys, bunker/NWC URLs, private chat bodies or full sensitive logs. Support owns case wording and closure; Development owns server changes; Walkie Talkie owns recipient compatibility and mobile acceptance.

Definition of done for a mobile fix: reproduced cause, appropriate regression/device evidence, truthful supported-client statement, current docs and a Support-ready resolution note. Production distribution requires the existing release procedure.
