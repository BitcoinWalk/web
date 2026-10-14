---
title: Run BitcoinWalk on your own relay
description: What organizers and relay operators need to host a BitcoinWalk city on independent infrastructure.
---

BitcoinWalk is designed so a Pro city can eventually use infrastructure operated by its organizer or a trusted local relay operator. The organizer keeps control of the city identity and signed records; operating the server does not transfer ownership of the city.

This workflow is **not yet self-service**. BitcoinWalk-managed city relays work today, while compatibility verification and organizer-owned mirror activation are still being completed. This page describes the intended supported route so operators can prepare without guessing.

## You do not need a Bitcoin or Lightning node

A city relay is a Nostr service. It does not need access to a Bitcoin node, Lightning node, wallet or payout credentials. Keep it isolated from financial services and signing material.

The smallest practical installation needs:

- a Linux host or VPS with a stable public address;
- a city-controlled domain name and valid TLS certificate;
- a public `wss://` endpoint;
- persistent storage, backups and enough free space for growth;
- a process supervisor with automatic restart; and
- an operator who can apply updates and respond to monitoring alerts.

Final CPU, memory and storage minimums will be published with the supported package. Until then, do not size production infrastructure from an experimental build.

## Relay requirements

The endpoint must provide NIP-01 transport and accurate NIP-11 metadata. It must support NIP-42 authentication when a protected operation requires it.

BitcoinWalk compatibility adds stricter requirements:

- accept only authorized city-scoped delivery;
- preserve exact signed NIP-52 walk events;
- apply cancellations, revocations and moderation decisions;
- prevent hidden or unauthorized records from reappearing;
- recover missed events after an outage;
- retain data across service and host restarts; and
- return the exact visible event set during an audit.

An ordinary public Nostr relay is not automatically a BitcoinWalk city relay. Accepting one test event proves transport, not authorization, moderation or recovery.

## Planned onboarding workflow

Once organizer-owned relay onboarding is released, the normal path will be:

1. **Prepare the endpoint.** Configure the public hostname, TLS, storage, backups and the supported BitcoinWalk receiver or adapter.
2. **Submit the relay in the dashboard.** The organizer chooses the city and enters the endpoint. The city must already be approved and eligible for Pro relay features.
3. **Prove administrative control.** BitcoinWalk supplies a short-lived city-bound challenge. The operator installs it using the documented relay configuration or a same-host well-known HTTPS response.
4. **Run compatibility checks.** BitcoinWalk tests connectivity, relay metadata, authentication, city-scoped admission, moderation, restart retention and recovery behaviour.
5. **Start as a mirror.** BitcoinWalk seeds only the city's currently visible signed state and verifies exact event IDs and signatures. The managed relay remains primary during the initial soak period.
6. **Verify continuous replication.** Monitoring confirms catch-up after disconnects and checks that hidden, revoked and unrelated data are absent.
7. **Authorize discovery.** The city owner signs a directory successor adding the accepted mirror. A BitcoinWalk operator verifies and activates that exact signed record.
8. **Consider a later primary handover.** Moving the independent relay from mirror to primary requires a separate migration, soak and rollback review.

The relay operator may authenticate transport, but cannot sign an ownership change on behalf of the organizer. BitcoinWalk never needs the organizer's secret signing material.

## Prepare before onboarding opens

You can safely prepare the following now:

- choose a durable city hostname rather than a temporary provider URL;
- enable modern TLS and WebSocket proxying without short idle timeouts;
- document service installation, updates and rollback;
- create automatic, tested storage backups;
- monitor disk space, process health, TLS expiry and WebSocket availability;
- decide who responds when the relay is offline; and
- review the [BitcoinWalk relay compatibility requirements](/relays/compatibility/).

Do not publish a city-directory change or replace the current primary endpoint before the compatibility and mirror checks pass.

## Packaging status

BitcoinWalk does not yet publish a supported general-purpose Docker, Umbrel or Start9 package for organizer-owned production relays. The supported package must include pinned software, safe defaults, persistent volumes, upgrades, backup and restore, monitoring, compatibility tests and a documented recovery path.

When those artifacts are released, this guide will link to the exact images and supported versions. Until then, custom deployments should be treated as preparation or test infrastructure, not as recognized production city relays.

