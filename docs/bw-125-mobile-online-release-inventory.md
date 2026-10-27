# BW-125 mobile online release inventory

Reviewed 27 October 2026. This inventory separates the Android online companion
release from later notification, verified-link and proximity work. It records
evidence; it does not authorize a store publication.

## Published baseline

- Zapstore currently serves `org.bitcoinwalk.walkietalkie` version `26.10.32`,
  version code `39`, from source commit
  `09d28c9ccbd32f2aaf9d266a5cc2a436b01acebc`.
- The signed release event is
  `e6ec463bf216db0bb4ad2a83fe5578364a0f164bd5a78ddecf525b5c66711664`.
  Its APK asset declares SHA-256
  `76e7fff74453e1ceeb062ad8685fcd3fa76347a6c22a465bb31a276730c7fa32`
  and signing-certificate SHA-256
  `92afc33544e32b171b07ade23696ee845913ffbc48a9741e215b45168401f946`.
- The public event advertises Android arm64-v8a, armeabi-v7a, x86 and x86_64.
  Zapstore publication is the production Android channel; there is no accepted
  iOS/TestFlight release in this inventory.
- GitHub's latest successful production workflow, run `39737408534`, built
  source `d9b8efc` as version `26.10.31` but had no Android signing credentials
  and therefore emitted only an offline-signing artifact. Version `26.10.32`
  was subsequently signed and published through the offline route. The next
  release must preserve the certificate above and retain exact source/artifact
  evidence.

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

The current `feat/city-mosaic` checkout at published commit `09d28c9` has two
uncommitted Amber application-image metadata changes. Against that working tree:

- 16 focused city, chat, membership, sign-in and diagnostics suites passed:
  100 tests.
- Five standard NIP-17/Guide suites passed: 77 tests.
- TypeScript and the Walkie Talkie release-metadata test passed.
- Lint completed with zero errors and 154 existing warnings. The warning count
  must be treated as accepted technical debt, not as a clean-lint claim.

These checks prove source behavior only. They do not replace installation,
upgrade, remote-signer or relay acceptance on a physical phone.

## Required online-slice work

### 1. Converge one release branch

1. Start from published `feat/city-mosaic` commit `09d28c9`.
2. Integrate `ccbfdb2`, the tested canonical City/Guide/Global/Hosts target
   parser and server-response contract from branch `bw156`.
3. Keep the already integrated `07f45e5` standard-DM implementation; do not
   reapply the older parallel BW-128 branch.
4. Review and either commit or discard the two local Amber app-image changes.
   If retained, use a durable approved BitcoinWalk image and test that Amber
   displays it; a unit assertion alone is insufficient.
5. Update the release guide where it still describes inherited PsstPsst names,
   identifiers and asset names. Confirm the Walkie Talkie workflow, package,
   Zapstore metadata and release notes all name the same artifact.
6. Produce a clean candidate commit, bump version name and version code once,
   and retain its test, checksum, signing-certificate and rollback evidence.

### 2. Close three online product gaps

1. **Membership consent:** the current bootstrap automatically requests both
   selected-city and Global membership, while current product documentation
   also says Global is an explicit choice. Select one behavior, make UI, tests
   and documentation agree, and avoid unexplained successive Amber approvals.
2. **Canonical route execution:** `ccbfdb2` validates canonical HTTPS targets
   but does not yet connect them to app navigation. Wire the resolved target to
   the existing native City/Global/Hosts/Guide screens and preserve the target
   through sign-in cancellation and retry. OS-level verified App/Universal
   Links remain BW-158.
3. **Invites:** the old `/walkie/city/<uuid>` formatter is test-only and unused.
   Replace it with the accepted canonical chat/walk navigation contract, or
   explicitly remove signed invite links from this release and keep BW-125 open
   for that slice. A link conveys navigation intent only; it never grants
   membership or a role.

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
   without an endless wait, wrong identity or duplicate account.
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
