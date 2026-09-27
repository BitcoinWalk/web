# BW-60 — portable city ownership and endpoint discovery

Status: 🟠 in progress. Relay commit `dc16bfc` implements and tests the signed trust chain plus strict consensus over independent mirror snapshots. The web organizer flow now constructs the exact root in the browser, confirms original-owner authority, asks SideCar to sign kind `30309`, verifies the returned event byte-for-byte at the template boundary, publishes the same event to every configured discovery relay and reads its exact ID back from each relay independently. It does not yet publish a real city directory, resolve successor chains from live WSS mirrors, change live routing or transfer ownership.

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

The relay implementation audits two to eight independently supplied, owner-controlled mirror snapshot files. Each mirror is validated separately and must resolve to the identical current event and state. Duplicate paths, stale mirrors, unsafe file modes, unknown fields or disagreement are rejected.

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
- stale, writable, unknown-field and single-source mirror rejection.

Relay verification after this increment is 93/93 top-level tests with race detector and vet green. One initial race run hit the existing one-second Armada metadata-budget timing test; an immediate complete race rerun passed.

## Remaining acceptance gates

BW-60 remains open until all of these pass:

1. successor-event signing for owner/operator update, rotation and recovery that never overwrites an accepted chain (confirmation-gated root signing is implemented);
2. bounded read-only WSS retrieval from at least two independently operated discovery mirrors;
3. a real staging city root anchored to its verified current owner through a separate trust channel;
4. owner update, operator endpoint update, owner rotation and offline recovery rehearsals;
5. client discovery of the new endpoint while the old discovery source is unavailable;
6. backup and rollback evidence with no implicit change to the existing replication registry;
7. an explicit distinction between owner control and BitcoinWalk official-directory recognition.

Endpoint activation and retirement belong to BW-61. BW-60 proves who controls discovery and how clients resolve it; it does not silently migrate a live receiver.
