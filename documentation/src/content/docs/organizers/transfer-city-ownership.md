---
title: Transfer a Pro city to a new owner
description: A safe handover procedure for an already-paid BitcoinWalk city.
---

A Pro payment belongs to the **city**, not to the person who paid it. Transferring the city therefore does not create another purchase or erase its walks, sponsors, relay history or public URLs.

Ownership transfer is a signed handover. BitcoinWalk never asks either host for secret signing material.

## Before you start

Prepare:

- the city name and City ID;
- the current owner's Nostr account;
- the new owner's exact `npub`;
- access to the city's offline recovery identity;
- the new owner's private Lightning payout destination.

Both owners should keep recovery backups. Do not send an `nsec`, bunker secret or wallet credential to BitcoinWalk.

The super-admin first verifies that the city is approved, its Pro entitlement is settled and unsuspended, and its signed directory record agrees across both BitcoinWalk directory transports.

## 1. Prepare the transfer

The super-admin opens **City relay setup**, selects the city and enters the new owner's `npub`. BitcoinWalk prepares one immutable transfer request bound to the current directory event.

The request does not publish anything and the new `npub` does not gain access merely because it was entered.

## 2. Current owner authorizes the handover

The current owner opens the supplied request link, connects the account shown in the request and signs the exact directory rotation.

The signature preserves the City ID, relay endpoints, operators and recovery authority. It changes only the owner. A stale predecessor, different signer or altered destination is rejected.

## 3. New owner accepts

The new owner opens the same request, connects the destination account and signs the acceptance. This proves control of the destination key and binds acceptance to the exact owner-signed rotation.

Signing either step alone does not activate the transfer.

## 4. Super-admin activates and verifies

The super-admin reviews both signatures and activates the exact transfer. BitcoinWalk then:

1. publishes and reads back the owner rotation from every configured directory transport;
2. publishes a versioned city-permission successor;
3. makes the new owner the protected city editor;
4. removes the previous owner's editor access unless retaining it was explicitly approved;
5. verifies the new permissions from the relay.

The original creator remains recorded as immutable provenance, but that historical fact no longer grants dashboard or publishing access.

## 5. Reconfirm private Pro settings

The new owner signs in and opens **City upgrade** for the transferred city. Ownership rotation deliberately invalidates the previous owner's private setup confirmations.

The new owner must:

- confirm their private Lightning payout destination;
- reconnect and prove control of the city identity;
- verify NIP-05 and the public Lightning address;
- review sponsor, community and relay controls.

For a migrated existing Pro city, the same verified identity may be both the new owner and the existing public city identity. This exception is limited to the signed transfer flow; normal Pro onboarding still keeps the personal owner and city identity separate.

## What stays unchanged

- the Pro entitlement and original payment;
- City ID, default URL and aliases;
- historical walk authors, event IDs and signatures;
- existing relay endpoints and retained directory history;
- sponsors and historical OG images;
- payment obligations created before the transfer.

Past payment obligations keep the payout configuration that applied when they were created. Only future eligible payments use the newly confirmed payout setup.

## Recovery and failed attempts

An incomplete transfer grants no partial ownership. Exact retries are safe. If the current owner is unavailable, the declared offline recovery identity can rotate the directory owner, followed by the same destination acceptance, permission update and Pro setup checks.

Stop and contact BitcoinWalk if the directory transports disagree, the requested owner is unexpected, or the city permission record does not match the directory owner.
