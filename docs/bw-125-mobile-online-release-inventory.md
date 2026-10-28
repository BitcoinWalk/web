# BW-125 mobile online release inventory

Reviewed 28 October 2026. This inventory separates the shipped Android online
companion release from later notification, verified-link and proximity work.

## Published baseline

- Zapstore currently serves `org.bitcoinwalk.walkietalkie` version `26.10.37`,
  version code `44`, from source commit
  `2cdfc0c0558c2f9ff5c3570999cdb6e7427537fb`.
- The signed release event is
  `8b2bb270caf265544d818d5877ce8bc792832f6ea7ac4c38c4bd33b4bbd65bc0`.
  Its APK asset declares SHA-256
  `4d57d26929a175dbd30faf2fc62f7baecd423754553ea0fcc7bc46eb5e90efdb`
  and signing-certificate SHA-256
  `92afc33544e32b171b07ade23696ee845913ffbc48a9741e215b45168401f946`.
- The public event advertises Android arm64-v8a, armeabi-v7a, x86 and x86_64.
  Zapstore publication is the production Android channel; there is no accepted
  iOS/TestFlight release in this inventory.
- CI run `40703711715` built the unsigned recovery artifact from the exact
  release source. The accepted APK was signed offline with the permanent
  BitcoinWalk key and published through ngit; asset event
  `83903e1212db2e9da342ae271d97b8c9383cd54f75efd12c3bd583f5161fda93`
  and the release event above were independently read back from both
  `wss://relay.zapstore.dev` and `wss://relay.ngit.dev`. The public listing
  shows `26.10.37` first.

## Implemented online surface

- Approved-city selection is available before sign-in and persists as the app
  context. The selected canonical BitcoinWalk city page is the Walks home.
- The production `/api/cities` contract currently returns 24 approved cities;
  all 24 expose independently verified City and Global NIP-29 destinations.
- The production canonical target resolver returns resolved City, Global,
  Guide and Hosts targets with the expected public-membership, account-inbox
  and signed-host-roster boundaries.
- Public City/Global/Hosts communities support bounded history, live messages,
  explicit membership, replies, reactions, mentions, public-media handling,
  payment-request text and per-room notification preferences. Public community
  messages are labelled as relay-readable rather than end-to-end encrypted.
- Standard kind-14 NIP-17 text receive/send and bounded Guide recovery are in
  the published source line through commit `07f45e5`; the completion boundary
  remains the explicitly accepted BW-128 contract.
- Local-key, `nostrconnect://` and `bunker://` onboarding, bounded Android
  foreground recovery and privacy-filtered in-app diagnostics are present in
  the published source line.
- Bluetooth remains parked behind **Coming soon** without requesting radio
  permission or starting discovery.

## Inventory verification

The published `09d28c9` baseline and the candidate lineage were checked as
separate immutable source states. Across the focused inventory:

- 16 focused city, chat, membership, sign-in and diagnostics suites passed:
  100 tests.
- Five standard NIP-17/Guide suites passed: 77 tests.
- TypeScript and the Walkie Talkie release-metadata test passed.
- Lint completed with zero errors and 154 existing warnings. The warning count
  must be treated as accepted technical debt, not as a clean-lint claim.

These checks prove source behavior only. They do not replace installation,
upgrade, remote-signer or relay acceptance on a physical phone.

## Candidate implementation update

Candidate `158b995d57e8c69e50958f40e84211fbe736797e` builds on online-routing
commit `b0a60aa`, canonical-target commit `ccbfdb2`, bounded-inbox commit `4ed5d4a`
and the published `09d28c9`
line. It is version `26.10.33`, Android version code `40`.

- City selection now requests only the selected City membership. Global remains
  an explicit join, preventing a second unexplained signer approval.
- Canonical server-resolved City, Guide, Global and Hosts targets now open the
  existing native destinations. A validated native target is persisted for at
  most 15 minutes through sign-in cancellation, retry or restart, then consumed
  exactly once. It contains no account, role, relay or membership authority.
- The unused `/walkie/city/<uuid>` test-only formatter and its misleading tests
  are removed. Exact walk-event handoff is not claimed by this online release.
- Walkie Talkie's current package/scheme identities and the Zapstore production
  baseline replace stale inherited release-guide claims.
- Pasted `bunker://` and app-initiated `nostrconnect://` sessions now send the
  exact **Walkie Talkie** name, BitcoinWalk URL and production app icon to Amber.
  The icon is the byte-identical 1024×1024 Zapstore artwork served directly as
  a PNG from `bitcoinwalk.org`, rather than a third-party redirect or CDN URL.
- All 168 BitcoinWalk service/component tests, TypeScript, release metadata and
  lint pass; lint retains 154 accepted warnings and no errors. The wider suite
  passed 2,380 of 2,382 tests. The only failures are the existing Electron
  fake-Bluetooth-helper assertions, outside the Android online slice.
- GitHub workflow `40666025027` passed the clean verification, bounded-inbox
  regression and reproducible
  Android build from that exact commit after the removed F-Droid image digest
  and advanced Debian Security OpenJDK package were refreshed to exact current
  pins. Gradle completed 2,376 tasks and the repository scanner confirmed
  arm64-v8a, armeabi-v7a, x86 and x86_64.
- The workflow intentionally had no production signing credentials and emitted
  only `WalkieTalkie-26.10.33-android-unsigned.apk`. Its SHA-256 is
  `dc7523c64330740297d3b58bc5724643c857546db76006529ebb85dd3699a2c9`.
  CI and local read-back confirm package `org.bitcoinwalk.walkietalkie`, version
  `26.10.33`, code `40`, exact source provenance and an unsigned archive with no
  JAR signature entries. This artifact must not be installed or distributed.

## Signed candidate — 28 October 2026

The exact CI artifact above was signed offline with the permanent BitcoinWalk
Android key. The signed candidate is
`WalkieTalkie-26.10.33-android.apk`, SHA-256
`2512b0597b1cc74733124be82d6ca25b502400df76cf731c063dca3990287d9c`.
Independent read-back verifies:

- package `org.bitcoinwalk.walkietalkie`, version `26.10.33`, code `40`;
- one signer using v2 and v3 APK signature schemes;
- signing-certificate SHA-256
  `92afc33544e32b171b07ade23696ee845913ffbc48a9741e215b45168401f946`,
  unchanged from the published `26.10.32` app; and
- arm64-v8a, armeabi-v7a, x86 and x86_64 native libraries.

The earlier signed build from `21580c4` is explicitly invalidated. Its physical
upgrade test preserved the account but exposed an indefinite Chat loader while
membership discovery waited for Amber's 60-second signer timeout. Candidate
`158b995` gives initial inbox discovery an eight-second total deadline, falls back
only to locally saved city membership and never infers Hosts from stale state.
The fresh signed artifact installed in place on the Pixel with the unchanged
production certificate. With Amber unavailable, Chat exits loading, shows a
truthful refresh error and retains BitcoinWalk Guide, BitcoinWalk Global and the
saved Madeira city. Device logs can still record the independent 60-second signer
timeout later, but it no longer blocks the inbox. The existing account and city
context remained intact. Fresh Pixel/GrapheneOS acceptance on 28 October
against app commit `2cdfc0c`
(`26.10.37` / code `44`) and remote-signer `0.8.64` completed the positive Amber
Nostr Connect path: Amber published both the approval and follow-up response,
Walkie returned without timeout and the exact BitcoinWalk identity persisted on
Account. The signed APK SHA-256 is
`4d57d26929a175dbd30faf2fc62f7baecd423754553ea0fcc7bc46eb5e90efdb`
and the certificate remains
`92afc33544e32b171b07ade23696ee845913ffbc48a9741e215b45168401f946`.
A subsequent BitcoinWalk → endo switch, full app restart and endo → BitcoinWalk
switch restored the correct active identity at every boundary and retained
exactly the original three accounts with no duplicate. A final single-device
isolation check created an unsent draft only in BitcoinWalk's self-chat, switched
to endo and confirmed endo's self-chat composer was blank, restarted with endo
still active, then switched back and recovered the BitcoinWalk-only draft without
leakage or duplication. The temporary draft was cleared and no message was sent
or published. That exact candidate is now the public Zapstore release. The user explicitly waived the
separate two-user/one-organizer physical pilot on 28 October 2026 because no
second phone is available. That pilot was not run and must not be represented as
passed.

## Remaining online-slice work

Role-aware website handoff and confirmed post-payment membership remain BW-149.
The online Android release may expose existing authorized web administration,
but it must not infer a role from a URL or duplicate the web authorization
system.

## Android candidate acceptance

Run this matrix against one clean, versioned candidate rather than assembling
evidence from different branches:

1. Fresh installation and in-place upgrade from Zapstore `26.10.32`, preserving
   accounts, city choice, conversations and the production signing identity.
2. Pixel/GrapheneOS with the recorded Amber version: complete both
   `nostrconnect://` and `bunker://`; cancel and retry each; return from Amber
   without an endless wait, wrong identity or duplicate account, and confirm
   Amber displays the exact Walkie Talkie name and BitcoinWalk icon.
3. Choose two different approved cities and verify the correct city page,
   artwork and City/Global destinations after restart and refresh.
4. Accept, reject and retry the final membership-consent design. Confirm a
   successful membership once, no duplicate join request on restart, and no
   false **Joined** state after cancellation or relay failure.
5. Send, receive, reply and react in City and Global. Verify public-chat privacy
   copy, message deduplication, history recovery and truthful failure state
   during a relay interruption.
6. Confirm Hosts is absent for an ordinary participant and available only for
   an identity confirmed by the signed host roster.
7. Receive one Guide message and exchange standard NIP-17 text; restart and
   switch accounts without a duplicate, cross-account draft or stale result.
8. Exercise the supported zap/payment request path with a disposable or bounded
   wallet and confirm that invoice creation is never presented as settlement.
9. Export diagnostics after a deliberate signer and relay failure. Confirm the
   export contains useful bounded codes but no private key, bunker secret,
   NWC connection, private message body or complete sensitive URL.
10. Open each canonical target inside the candidate, cancel sign-in, resume and
    restart. Retain the exact target and rederive all membership and roles.

The first pilot should cover two consenting Android users and one organizer
through a complete walk cycle. iOS remains a separately recorded gate.

## Explicitly outside this release

- Reliable terminated-app and iOS notification delivery: BW-93.
- Android App Links and iOS Universal Links: BW-158.
- Sponsor/host web-to-app handoff: BW-149.
- BLE/geofence proximity discovery: the later BW-125 slice after online
  acceptance and BW-93.
- Private Marmot groups and encrypted multi-hop transport: BW-127.

## Exit decision

The online Android slice may be promoted when the branch is clean, the three
product gaps above are resolved, automated release gates pass, and the physical
candidate matrix has no release-blocking signer, wrong-room, membership,
account-isolation or upgrade defect. That promotion advances BW-125 but does
not close it while notification/BLE acceptance remains in its retained scope.
