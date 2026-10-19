# Guide / Walkie Talkie compatibility baseline

16 October 2026. WalkieTalkie source commit f7ba19b9bd87d0e0f1741710eb677a9b5c7958f9; web checkout commit 6fa6065. Repository/test baseline only; no device connection or live DM sent.

## Verified finding

BW-128 remains necessary. Guide uses nostr-tools/nip59 wrapEvent with recipient identity in src/guide/core.ts:115. The mobile relay intake calls unwrapGiftWrapWithKeys with separate DM encryption keys (src/services/dm/dm.service.ts:1327). That decoder requires the extension n tag on the seal and returns unsupported for its absence (src/services/crypto/nip17-gift-wrap.ts:223). Ordinary messages encrypted to the identity key can fail even before seal classification because this path does not invoke the account signer's identity-key decryption.

The generic/proximity decoder supports a unified key, but that does not demonstrate standard NIP-17 support in relay account intake. Removing the n-tag check alone would not fix external signer decryption.

When an unsupported result is returned, dm.service.ts:1343 persists the wrapper as processed. An interoperability fix therefore needs bounded recovery of previously skipped messages, not only a new decoder. Failed decryption is tracked separately in-session.

## Executed baseline

| Suite | Result | Meaning |
|---|---|---|
| Mobile crypto/nip17-gift-wrap | 10/10 passed | Existing split-key behavior and intentional ordinary-message rejection reproduced |
| Mobile dm/receive-readiness + signer/nip46-signer | 45/45 passed | Current intake and remote-signer contract regressions pass |
| Web guide/guide + guide/pro-setup | 21/21 passed | Existing notification and Pro-state tests pass |

76 tests passed in total. Passing existing tests does not mean cross-client compatibility passed: some explicitly assert rejection of standard messages. The shell command containing web tests subsequently exited 2 because the requested baseline files did not yet exist; Vitest itself reported all 21 passed.

## Acceptance matrix

| Path | Baseline | Next evidence required |
|---|---|---|
| Guide -> Walkie Talkie relay account | Blocked by source contract; live receipt untested | Standard signed/encrypted fixture via identity signer, then real opt-in device receipt |
| Local identity-key decoder | Unit-only support in generic path | Relay intake integration and recipient validation |
| NIP-46 | Encryption/decryption interface exists; unit tests pass | Both wrapper/seal decryption through the selected signer, cancellation/resume |
| Pixel/GrapheneOS + Amber | Prior basic app acceptance, no current DM acceptance | Exact app/signer versions, Guide receipt once and link opening |
| iOS | Not tested here | Real device and supported signer |
| Restart and old unsupported messages | Existing unsupported rows may be skipped | Bounded reprocessing, logical-message deduplication |
| Guide inbound support | Not provided by existing notification worker | BW-67 intake and operator-reviewed reply acceptance |

## First implementation slice

1. Read mobile architecture and current primary protocol specs; use exact-version Expo guidance before editing code.
2. Add a standard NIP-17 receive path through the selected identity Signer.nip44Decrypt, retaining separate-key extension handling.
3. Verify wrapper/seal signatures, recipient semantics, rumor ID and seal-author equality. Scope asynchronous results to the current account; preserve cancellation.
4. Add sender interoperability and peer capability selection without silent encryption downgrade.
5. Define bounded replay for unsupported history and duplicate logical rumors across envelopes/relays.
6. Run synthetic standard nostr-tools Guide fixtures, independent-client fixtures and extension regressions.
7. Test an opt-in Pixel/Amber recipient and independent client; record receipt, exact deep link and restart behavior. Do not classify relay ACK as read.
8. Only then claim Guide compatibility or advance two-way Support messaging.

Owner: Walkie Talkie. Development supplies Guide fixtures/read-only diagnostic contract. Support supplies redacted symptoms and confirms the real user outcome. No production change or customer messaging is authorized by this baseline.

## Implementation checkpoint — 16 October 2026

BW-128 is now in progress. The local WalkieTalkie working tree adds foreground
standard kind-14 NIP-17 reception through the identity signer. A synthetic
`nostr-tools/nip59.wrapEvent` fixture exercises the same envelope construction
used by Guide. Both encryption layers are decrypted through the signer without
exporting its identity key; wrapper/seal signatures, account routing, rumor hash
and author binding are checked. Standard messages cannot replace NIP-4E peer keys.

Background work defers interactive signer use. The active receiver retains at
most 32 bounded encrypted envelopes for foreground retry, and account/session
changes discard stale results. Signer rejection is not recorded as successful
processing. Existing outgoing messages and relay routing are unchanged.

Validation: 176 tests passed across 21 messaging, crypto and signer suites.
This includes foreground retry, duplicate intake, peer-key isolation, wrong
accounts, signer refusal, altered signatures/content and stale sessions. These
are local automated tests, not a real Amber/Guide delivery acceptance.

Remaining before release: standard outbound routing and signer encryption;
bounded recovery of historically skipped messages; explicit unsupported/signer
feedback and background policy; then a Pixel/GrapheneOS + Amber test with a real
opt-in Guide notification and an independent standard client in both directions.
Record app/signer versions, receipt once, link opening, account switching and
restart deduplication. No APK release, production deployment or customer DM was
performed for this checkpoint.

## Integrated compatibility checkpoint — 19 October 2026

Walkie Talkie commit `07f45e5` integrates standard kind-14 NIP-17 text reception
and delivery onto the current city-mosaic release line. Identity-key encryption
and both decryption layers stay behind the selected local, extension or NIP-46
signer. Standard seals retain empty tags and independently randomized timestamps;
wrapper and seal signatures, exact recipient, rumor hash and author binding are
validated before storage. A standard envelope never becomes a NIP-4E peer-key
announcement, and extension groups, files, reactions, media and own-device copies
never silently downgrade to the text-only path.

Background intake never launches an interactive signer. It retains at most 32
recent encrypted envelopes for foreground retry. The explicit Guide recovery
action scans at most 32 recent wrappers, keeps old processed markers and history
cursors intact, stores by canonical rumor ID and emits no historical-arrival
notification. Account/session changes cancel stale work. The durable outbound
queue stores the exact wrapper before publication and reuses it on retry.

Validation on the integrated release line passed 196 messaging, crypto, signer,
support-state and Guide-recovery tests, the TypeScript check and lint with no
errors. The synthetic independent side uses the public `nostr-tools` NIP-59
implementation and opens the generated message without BitcoinWalk extensions.
This proves the source contract, not a person's receipt. Android test workflow
`39245594059` was started for the real-device gate.

Remaining acceptance is deliberately physical and versioned: install that test
APK on Pixel/GrapheneOS, record the Amber version, receive one real Guide message
once and open its link, exchange text in both directions with an independent
standard NIP-17 client, switch accounts, reconnect and restart without duplicates,
and record bounded feedback for an unreadable/unsupported message. iOS remains
unverified until a real iPhone and supported signer are available. Guide stays
notification-only; conversational support remains BW-67.
