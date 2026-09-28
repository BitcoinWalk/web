# BW-60 — portable city ownership and endpoint discovery

Status: 🟢 complete for the implemented and staging-accepted scope. Relay commit `2f46453` implements and tests the signed trust chain, strict consensus over independent mirror snapshots, and an owner-signed offline bundle that makes public relays optional attestations rather than bootstrap dependencies. The web organizer flow constructs the exact root in the browser, confirms original-owner authority, asks the connected NIP-07-compatible browser signer to sign kind `30309`, verifies the returned event byte-for-byte at the template boundary, publishes the same event to every configured discovery relay and reads its exact ID back from each relay independently. Memphis now has a real accepted root, durable anchor and two publicly reachable BitcoinWalk staging transports in separate VPS failure domains. Both live one-transport-down directions and the complete isolated successor sequence are accepted. Production endpoint replacement is tracked separately in BW-61.

App `0.3.69` embeds `wss://relay.damus.io/` and `wss://nos.lol/` as independent staging discovery sources. On 27 September 2026 both completed bounded kind-30309 reads independently and returned an empty pre-root baseline. The release passed 290/290 tests, production build, package smoke and static-bundle verification, then was accepted on staging. Public and loopback health, the protected directory route, the Guide, source relay, both replica services and Caddy remained healthy. The first attempt stopped before changing the unit because the candidate filename was not a valid systemd unit name; resume `109a2ad` reused the intact staged release and accepted it after backup `/var/backups/bitcoinwalk-city-directory-app-resume.3UsEnf`. No root was signed or published by deployment.

The Memphis owner then signed root event `d16d969d0bf77c1a71453005b551ab7e2693d293888c2119928df93a69b21a79`, naming `wss://replica-staging.bitcoinwalk.org/` as primary, no public city mirrors or operators, and recovery pubkey `74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0`. Initial browser publication reached nos.lol but Damus was rate-limited. App `0.3.70` adds fail-closed exact-root recovery; the already verified signed event was subsequently retransmitted unchanged from the VPS network path. Exact-ID read-back from both discovery relays returned the identical signature. No replacement root was created. The recovery pubkey is also present in the current Memphis city-editor grant, so it should be treated as operationally offline only if its private key has never been used online; successor tooling must support replacing it if stricter separation is required.

Operator `0.8.34` then installed the exact root ID, initial-owner anchor and owner-signed event as a local last-known-good bundle. The compiled resolver validated the signature, pinned root, sequence, authority, endpoint and chain without any network source. Damus and nos.lol were queried only as optional attestations; nos.lol failed three bounded connection attempts and succeeded on the fourth, after which both public snapshots resolved identically to the bundle. Activation therefore reported `2/2`, but would also have accepted `0/2` without weakening authenticity. Backup `/var/backups/bitcoinwalk-city-directory-anchor.Fd5QoJ` preserves the prior state. No live relay binary, registry, journal, event database, app, Guide, DNS or Caddy state changed.

Relay `0.8.35` adds the first BitcoinWalk-operated transport as an isolated loopback-only service on `127.0.0.1:3343`. It accepts only kind `30309`, requires NIP-42 authentication as the event author, validates every update against the pinned current chain and serializes admission so competing successors cannot both enter storage. Because kind `30309` is normally addressable, this service deliberately retains every signed predecessor instead of replacing old revisions. The backup-first staging activation seeded the exact Memphis root, read it back over WebSocket, restarted the service and obtained the identical signed root again. Its database is separate from every organizer and replica database. Backup `/var/backups/bitcoinwalk-directory-staging.VoLfxP` is recoverable. Caddy and DNS were not changed.

Operator `0.8.36` exposed that same isolated transport at `wss://directory-staging.bitcoinwalk.org/`. Caddy configuration validation passed before activation, certificate issuance converged after three bounded waits, and public TLS plus loopback returned the identical signed root and resolved state. An independent workstation then obtained a healthy `/healthz`, captured root `d16d969d0bf77c1a71453005b551ab7e2693d293888c2119928df93a69b21a79` over the public WebSocket and passed the compiled signature, pinned-root, chain, authority and endpoint audit against the offline bundle. The activation changed neither the directory service nor its database and did not restart either one. Backup `/var/backups/bitcoinwalk-directory-tls.EypTqO` preserves the prior Caddy state.

Operator `0.8.41` installed the same pinned root and exact owner-signed bundle in a private, non-root Docker container on the separate `.240` VPS. The container publishes no host port and is reachable only through `root_my_custom_network`; Nginx Proxy Manager terminates public TLS at `wss://directory-2-staging.bitcoinwalk.org/`. The bundled root, primary read-back, secondary pre-restart read-back and secondary post-restart read-back were semantically identical and shared canonical digest `b8d4d63c…d814ad`. The secondary database remains separate from every application, organizer and replica database. Backup `/var/backups/bitcoinwalk-directory-2-staging.pxmuX8` preserves the accepted Docker activation; the Nginx Proxy Manager database was backed up separately before credential and proxy-host changes.

App `0.3.71` changes the staging discovery default to the two BitcoinWalk transports. Its backup-first activation verified both public NIP-11 endpoints, embedded both WSS roots, retained every related service as active and changed only the staging app release. Backup `/var/backups/bitcoinwalk-city-directory-first-party.BAkSVF` preserves the accepted `0.3.70` service configuration. An explicit `NEXT_PUBLIC_DIRECTORY_RELAYS` still replaces the entire list, which is mandatory for production. Damus and nos.lol remain optional attestations and may still serve unrelated profile or DM roles, but neither is a default city-directory dependency.

App `0.3.72` adds fail-closed partial-outage discovery. It queries each configured transport independently, retains one exact valid owner root when another transport is unavailable, and reports which sources completed. It accepts root absence only after every configured transport completes; an empty reachable source plus an unavailable source is indeterminate and cannot lead to a replacement signature. Conflicting valid roots still fail closed. During an outage, the owner UI displays the recovered root without attempting a repair publication that cannot meet the all-transport acknowledgement policy.

The initial `0.3.71` and `0.3.72` artifacts were built from a clean worktree without explicit application read/write relay variables. Their directory settings were correct, but the browser bundle contained no application read relay. Human acceptance of `0.3.72` exposed this as `No read relay configured` before the outage rehearsal began. The operator immediately restored verified app `0.3.70`; loopback health returned `app-staging-0.3.70`, its service was active on the recorded working directory and the primary directory transport was active. No directory service or database changed. Both artifacts are rejected and must not be activation bases.

App `0.3.73` corrects the release boundary: staging application and directory transports are source-controlled non-blank defaults, explicit production values still replace them, packaging refuses a browser bundle missing any required staging URL, and the installer independently checks all three URLs before activation. It upgrades directly from known-good `0.3.70` and never trusts the rejected releases.

Controlled staging rehearsals then stopped each directory transport separately, with an automatic 15-minute recovery armed before every outage. In both directions the packaged client retained Memphis root `d16d969d…b21a79` and owner `4506e04e…6ba04` through the surviving transport without creating a conflicting successor. The primary and secondary were restored immediately; the secondary returned canonical digest `b8d4d63c…d814ad`, its private Docker topology still exposed no host port, and both public NIP-11 endpoints remained healthy. App `0.3.74` removes the misleading shared “Trust anchor created” result: a tested submission plan now separates `verify-existing`, `recover-existing` and `create`, so the outage path returns before root signing and displays “Existing trust anchor verified.” The release passed 309/309 tests, typecheck, production build, package smoke, checksum verification and GitHub CI. Its backup-first staging activation is recoverable from `/var/backups/bitcoinwalk-city-directory-outcome-copy.prOkgg`; every related service and both transports remained healthy, and no directory root, transport, relay database, Guide, DNS or Caddy state changed.

App `0.3.75` adds confirmation-gated successor management for the current owner, listed endpoint operator and offline recovery authority. Before signing it requires both configured transports to resolve the same current event, constructs the role-limited successor, verifies the returned signature and exact template, then requires acknowledgement and exact-ID read-back from both transports. Its 320/320 tests, typecheck, production build, package smoke, checksums and GitHub CI passed; backup-first staging activation is recoverable from `/var/backups/bitcoinwalk-city-directory-successors.0ItkKs`. No successor was signed during activation.

Relay/operator `0.8.42` then exercised the complete policy against an isolated synthetic city with generated in-memory identities: owner update, operator endpoint update, owner rotation and offline recovery passed in sequences 1–4. Operator privilege escalation, a write by the rotated owner and competing authorised successors were rejected. The final recovery cleared all operators as required. The rehearsal captured both live Memphis transports before and after and proved the exact root remained identical; it installed no rehearsal event or executable into a live path. The recoverable evidence is `/var/backups/bitcoinwalk-city-directory-successors.TrHjdM`. Commit `cc923e7`, the full relay suite, race detector, vet, artifact checksums and GitHub CI are green.

## Purpose

A paid-city relay must remain discoverable when its hostname, hosting provider or BitcoinWalk relationship changes. The immutable city UUID identifies the city, but the UUID alone proves neither ownership nor official recognition. Clients begin from an explicit trusted root and then follow an owner-controlled signed chain.

This directory covers public-event relay endpoints only. It grants no access to private chat, DMs, Lightning, Alby Hub, NWC, replication credentials, the BitcoinWalk Guide identity or city-approval authority.

## Signed record

Directory records use BitcoinWalk application-specific Nostr kind `30309`. This is not presented as a standardized NIP kind.

The strict version-1 JSON contains:

- `cityId`: immutable lowercase UUID;
- `sequence`: monotonic unsigned integer beginning at zero;
- `action`: `establish`, `update`, `rotate` or `recover`;
- `previousEventId`: exact predecessor ID, empty only at sequence zero;
- `ownerPubkey`: current owner identity;
- `operatorPubkeys`: sorted endpoint-only delegates;
- `recoveryPubkeys`: exactly one offline recovery identity in version 1;
- `publicRelays`: one primary and up to seven sorted mirror endpoints.

Every endpoint is an exact normalized root `wss://` URL. The signed tags repeat the city, sequence, action, owner, operators, recovery identity, endpoints and predecessor. Unknown JSON fields, duplicate identities, duplicate endpoints, unsafe URLs, signature errors and content/tag disagreement fail closed.

## Authority transitions

- `establish` is sequence zero, signed by the owner named in the trusted anchor.
- `update` keeps the owner. The owner may update authorities and endpoints; a listed operator may change endpoints only.
- `rotate` is signed by the current owner, changes only the owner, and preserves endpoints, operators and recovery identity.
- `recover` is signed by the predeclared recovery identity, replaces the owner, preserves endpoints and recovery identity, and clears every operator.

A rotated owner no longer affects state. Malformed or unauthorised relay noise is ignored so outsiders cannot manufacture a fork. Two valid successors signed by an appropriate current authority are an actual conflict and fail closed rather than being resolved by timestamps or lexicographic order.

## Trust anchors and mirrors

The anchor binds one city UUID to the exact root event ID and initial owner pubkey. An anchor may come from BitcoinWalk official recognition, an owner-controlled domain or another trust channel, but clients must know which trust source they selected.

The relay implementation can audit two to eight independently supplied mirror snapshot files as a consensus set. For bootstrap and last-known-good operation, it instead validates a release-bundled owner-signed snapshot against the locally pinned root; zero to eight public snapshots may attest to it. Each supplied attestation is validated separately and must resolve to the identical current event and state. Duplicate paths, stale mirrors, unsafe file modes, unknown fields or disagreement are rejected. Damus, nos.lol and similar public services are transports, not authorities or availability dependencies.

The organizer root-publication flow separately requires two to eight unique `NEXT_PUBLIC_DIRECTORY_RELAYS`. It checks each source before signing, never treats outsider noise as an owner root, requires every publication acknowledgement, and independently reads the exact signed event ID back from every source. Only the original city creator from the current signed BitcoinWalk grant can establish the root; editors and the BitcoinWalk super-admin cannot substitute themselves.

This file-based boundary deliberately separates deterministic protocol validation from network behaviour. Real WSS retrieval must additionally prove complete query results, bounded responses, timeouts and agreement across independently operated relays.

## Implemented tests

The relay suite covers:

- anchored establishment and duplicate-event deduplication;
- owner and endpoint-only operator updates;
- owner rotation and loss of old-owner authority;
- offline-key recovery with operator clearing;
- conflicting authorised successors;
- unauthorised mirror-noise resistance;
- strict WSS endpoint and content/tag validation;
- two-mirror agreement despite ordering and duplicate differences;
- stale, writable, unknown-field and single-source consensus rejection;
- offline bundle validation with zero public attestations and fail-closed disagreement.

Relay verification through secondary Docker packaging is 103/103 top-level Go test functions, plus 8/8 collector tests, with the full suite, race detector, vet, checksum audits, offline acceptance and GitHub CI green. Both public transports returned the same signed root before and after secondary restart. App failover tests cover valid-root retention, indeterminate-absence rejection, complete-absence acceptance and conflict rejection. Release-boundary tests additionally cover application/directory staging defaults, production overrides, blank-variable resistance, package rejection and known-good rollback.

## Accepted staging gates

BW-60 closed after all of these passed:

1. ~~successor-event signing for owner/operator update, rotation and recovery that never overwrites an accepted chain~~ — accepted on app `0.3.75` and isolated relay/operator rehearsal `0.8.42`;
2. ~~bounded read-only WSS retrieval from at least two independently operated discovery mirrors~~ — accepted for the Memphis root, with both snapshots agreeing exactly;
3. ~~a real staging city root anchored to its verified current owner through a separate trust channel~~ — accepted as `d16d969d…b21a79` and installed durably from an offline-verifiable bundle;
4. ~~owner update, operator endpoint update, owner rotation and offline recovery rehearsals~~ — accepted in sequence with escalation, rotated-owner and competing-successor rejection; live Memphis remained unchanged;
5. ~~client discovery of the signed root while either discovery transport is unavailable~~ — accepted in both live failure directions on app `0.3.73`, with the no-resigning result made explicit by tested app `0.3.74`;
6. ~~backup and rollback evidence with no implicit change to the existing replication registry~~ — every transport/app activation and both failover rehearsals were isolated from the registry, journal, replica databases and Guide;
7. ~~an explicit distinction between owner control and BitcoinWalk official-directory recognition~~ — enforced in protocol documentation and displayed by the owner UI.

The first transport is publicly accepted at `wss://directory-staging.bitcoinwalk.org/`; the second is publicly accepted at `wss://directory-2-staging.bitcoinwalk.org/` on a separate VPS and proxy stack. The staging client defaults to both and passed controlled live partial-outage rehearsals in each failure direction. BW-61 owns the additive endpoint-migration and production-hostname gates. Clients will ship their endpoints plus the signed last-known-good bundle, retain cached valid state during outages, and continue treating public relays as optional fan-out only.

Endpoint activation and retirement belong to BW-61. BW-60 proves who controls discovery and how clients resolve it; it does not silently migrate a live receiver.
