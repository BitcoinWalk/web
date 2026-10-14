---
title: City Transfer
description: Upgrade a city to Pro, then safely hand it over to a new owner.
---

City transfers are only available to Pro cities. A Pro payment belongs to the **city**, not to the person who paid it. Transferring the city therefore does not create another purchase or erase its walks, sponsors, relay history or public URLs.

Ownership transfer is a signed handover. BitcoinWalk never asks either organizer for secret signing material.

## Upgrade a Basic city to Pro first

If the city is currently Basic:

1. Open the city's public page on `bitcoinwalk.org`.
2. In the support section, select **Gift Pro to the host — 21,000 sats**. The current organizer or any supporter may pay the one-time upgrade; paying does not take ownership away from the organizer.
3. Pay the Lightning invoice and wait for BitcoinWalk to confirm it.
4. The current organizer signs in to the dashboard and opens **City upgrade** for that city.
5. Complete the requested city identity, recovery acknowledgement, Lightning payout and public-profile checks.
6. Wait until the dashboard shows the Pro entitlement and setup as verified.

Do not begin a transfer while the payment is pending or Pro setup is incomplete. The upgrade is attached to the existing City ID, so the city must not be registered again.

## Before you start

Prepare:

- the city name and City ID;
- the current owner's Nostr account;
- the new owner's exact `npub`;
- access to the city's offline recovery identity;
- a separate organizer-controlled recovery `npub` if the intended new owner is
  currently listed as the recovery identity;
- the new owner's private Lightning payout destination.

Both owners should keep recovery backups. Do not send an `nsec`, bunker secret or wallet credential to BitcoinWalk.

The super-admin first verifies that the city is approved, its Pro entitlement is settled and unsuspended, and its signed directory record agrees across both BitcoinWalk directory transports.

## 1. Prepare the transfer

The super-admin opens **City relay setup**, selects the city and enters the new owner's `npub`. If that identity is currently the city's recovery identity, the super-admin also enters the separate replacement recovery `npub`. BitcoinWalk prepares one immutable transfer request bound to the current directory event.

The request does not publish anything and the new `npub` does not gain access merely because it was entered.

## 2. Current owner authorizes the handover

The current owner opens the supplied request link and connects the account shown in the request. When the intended new owner is the current recovery identity, the owner first signs the reviewed recovery update and then signs the exact ownership rotation. Otherwise only the ownership rotation is required.

The signatures preserve the City ID, relay endpoints and operators. The recovery update changes only the recovery identity; the rotation then changes only the owner. A stale predecessor, duplicate authority, different signer or altered destination is rejected.

## 3. New owner accepts

The new owner opens the same request, connects the destination account and signs the acceptance. This proves control of the destination key and binds acceptance to the exact owner-signed rotation.

Signing either step alone does not activate the transfer.

## 4. Super-admin activates and verifies

The super-admin reviews both signatures and activates the exact transfer. BitcoinWalk then:

1. publishes and reads back any required recovery update and the owner rotation, in order, from every configured directory transport;
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
