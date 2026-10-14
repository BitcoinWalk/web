---
title: BitcoinWalk relay compatibility
description: What an organizer or relay operator needs before proposing a city relay.
---

## What City relay setup does

The dashboard can prepare a portable, owner-signed directory record describing a city's relay endpoints and authorities. Signing that record does **not** provision a server, activate replication, establish payment entitlement or make the endpoint officially recognized. Activation is a separate reviewed step.

## Minimum transport requirements

A candidate must provide:

- a stable public `wss://` endpoint with valid TLS;
- NIP-01 event transport and accurate NIP-11 metadata;
- NIP-42 authentication where required;
- durable storage that survives service and host restarts;
- bounded access and write policy for the exact city; and
- reliable backup, restore and upgrade procedures.

These are necessary but not sufficient for an official BitcoinWalk city replica.

## BitcoinWalk compatibility

BitcoinWalk also requires an accepted receiver or adapter that preserves:

- exact signed NIP-52 walk events;
- city ownership and organizer authority;
- cancellations, revocations and moderation decisions;
- suppression of hidden or unauthorized history;
- exact visible-event reconciliation; and
- continuous catch-up after an outage.

A generic public Nostr relay that accepts an event is not automatically compatible. A publication test proves only that the relay accepted that event; it does not prove city control, policy enforcement or recovery behaviour.

## Proof of control

When external-relay onboarding is available, the operator will receive a short-lived, city-bound challenge. It must be installed through the relay configuration or an approved well-known endpoint. BitcoinWalk does not request unrestricted server access or relay signing keys.

## Docker images

BitcoinWalk does not currently publish a supported public Docker image that turns an arbitrary relay into an official city replica. Do not treat a generic Khatru or Nostr relay image as a drop-in replacement. A future packaged relay will document supported versions, storage, backups, upgrades and compatibility tests before it is offered for production use.

See [Run BitcoinWalk on your own relay](/relays/run-on-your-own-relay/) for the planned onboarding sequence and a preparation checklist.
