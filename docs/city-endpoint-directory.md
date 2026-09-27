# BW-60 — portable city ownership and endpoint discovery

Status: 🟠 in progress. Relay commit `2f46453` implements and tests the signed trust chain, strict consensus over independent mirror snapshots, and an owner-signed offline bundle that makes public relays optional attestations rather than bootstrap dependencies. The web organizer flow constructs the exact root in the browser, confirms original-owner authority, asks the connected NIP-07-compatible browser signer to sign kind `30309`, verifies the returned event byte-for-byte at the template boundary, publishes the same event to every configured discovery relay and reads its exact ID back from each relay independently. Memphis now has a real accepted root and durable anchor; successor-chain signing, authority-transition rehearsals and independent BitcoinWalk discovery transports remain.

App `0.3.69` embeds `wss://relay.damus.io/` and `wss://nos.lol/` as independent staging discovery sources. On 27 September 2026 both completed bounded kind-30309 reads independently and returned an empty pre-root baseline. The release passed 290/290 tests, production build, package smoke and static-bundle verification, then was accepted on staging. Public and loopback health, the protected directory route, the Guide, source relay, both replica services and Caddy remained healthy. The first attempt stopped before changing the unit because the candidate filename was not a valid systemd unit name; resume `109a2ad` reused the intact staged release and accepted it after backup `/var/backups/bitcoinwalk-city-directory-app-resume.3UsEnf`. No root was signed or published by deployment.

The Memphis owner then signed root event `d16d969d0bf77c1a71453005b551ab7e2693d293888c2119928df93a69b21a79`, naming `wss://replica-staging.bitcoinwalk.org/` as primary, no public city mirrors or operators, and recovery pubkey `74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0`. Initial browser publication reached nos.lol but Damus was rate-limited. App `0.3.70` adds fail-closed exact-root recovery; the already verified signed event was subsequently retransmitted unchanged from the VPS network path. Exact-ID read-back from both discovery relays returned the identical signature. No replacement root was created. The recovery pubkey is also present in the current Memphis city-editor grant, so it should be treated as operationally offline only if its private key has never been used online; successor tooling must support replacing it if stricter separation is required.

Operator `0.8.34` then installed the exact root ID, initial-owner anchor and owner-signed event as a local last-known-good bundle. The compiled resolver validated the signature, pinned root, sequence, authority, endpoint and chain without any network source. Damus and nos.lol were queried only as optional attestations; nos.lol failed three bounded connection attempts and succeeded on the fourth, after which both public snapshots resolved identically to the bundle. Activation therefore reported `2/2`, but would also have accepted `0/2` without weakening authenticity. Backup `/var/backups/bitcoinwalk-city-directory-anchor.Fd5QoJ` preserves the prior state. No live relay binary, registry, journal, event database, app, Guide, DNS or Caddy state changed.

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

Relay verification after this increment is 95/95 top-level test functions, plus 2/2 bounded collector tests, with the full suite, race detector, vet, checksum audit, offline acceptance and one fresh Damus attestation green. GitHub CI for `2f46453` is green.

## Remaining acceptance gates

BW-60 remains open until all of these pass:

1. successor-event signing for owner/operator update, rotation and recovery that never overwrites an accepted chain (confirmation-gated root signing is implemented);
2. ~~bounded read-only WSS retrieval from at least two independently operated discovery mirrors~~ — accepted for the Memphis root, with both snapshots agreeing exactly;
3. ~~a real staging city root anchored to its verified current owner through a separate trust channel~~ — accepted as `d16d969d…b21a79` and installed durably from an offline-verifiable bundle;
4. owner update, operator endpoint update, owner rotation and offline recovery rehearsals;
5. client discovery of the new endpoint while the old discovery source is unavailable;
6. backup and rollback evidence with no implicit change to the existing replication registry;
7. an explicit distinction between owner control and BitcoinWalk official-directory recognition.

The next infrastructure increment is two BitcoinWalk-operated discovery relays in separate failure domains. Clients will ship their endpoints plus the signed last-known-good bundle, retain cached valid state during outages, and continue treating public relays as optional fan-out only.

Endpoint activation and retirement belong to BW-61. BW-60 proves who controls discovery and how clients resolve it; it does not silently migrate a live receiver.
