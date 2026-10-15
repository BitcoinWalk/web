---
title: Complete a city action
description: Follow the action assigned to a BitcoinWalk host without creating a duplicate city, account or payment.
---

The **Cities** screen tells the BitcoinWalk team who must act next. When it says **Next: City host**, the host should complete the named step using the Nostr account that already manages the city.

Do not register the city again, create a replacement host account or pay an invoice again. A recorded Pro upgrade belongs to the existing City ID.

## Before you start

Have these ready:

- the Nostr account that currently manages the city;
- the city signer or its recovery backup, if one already exists;
- a private Lightning address or LNURL-pay destination controlled by the host;
- access to the BitcoinWalk dashboard through a compatible browser signer or NIP-46 remote signer.

Never send anyone an `nsec`, seed phrase, bunker secret, wallet login or recovery file. BitcoinWalk asks for signatures and public proofs, not secret signing material.

## Correct and resubmit a city application

Use this when the city row repeats a reviewer instruction.

1. Connect the same host account that submitted the city.
2. Open the city application from the dashboard.
3. Read the reviewer note shown on the city row and change only the requested information.
4. Review the corrected city details and first walk.
5. Sign and resubmit the correction.

The corrected submission keeps the existing City ID and signed history. If the requested change is unclear, contact BitcoinWalk before signing a different city record.

## Complete Pro city setup

Use this when the city has already paid or received a gifted Pro upgrade but setup is incomplete.

1. Connect the personal Nostr account that already hosts the city.
2. Open **City upgrade** for that city. If BitcoinWalk Guide supplied a setup link, use that exact link.
3. Confirm the private payout destination. Saving it sends no payment and does not make it public.
4. Create or reconnect the separate city identity.
5. Back up its recovery method and confirm that the backup can be restored.
6. Review and sign the requested proofs. Some steps require one proof signature and one authenticated-request signature.
7. Wait for BitcoinWalk to verify the public profile, NIP-05 and Lightning address.

Do not pay another checkout invoice when the page says the payment is already recorded.

## Connect the city identity

The host’s personal account remains the dashboard login. The city identity is a separate public Nostr identity such as **BitcoinWalk in Graz**.

Choose one of these options:

- create a new city identity in the setup page, then save its one-time recovery backup; or
- reconnect the exact existing city identity from its protected backup or dedicated remote signer.

Confirm that the connected `npub` is the expected city identity before signing. Do not paste a personal `nsec` into the page, and do not replace an existing city identity merely because setup was interrupted.

## Confirm the recovery method

Store the city identity backup somewhere the local team can recover it if a device is lost. If using a remote signer, confirm its documented recovery method instead.

Only tick the recovery confirmation after the backup has actually been saved and checked. BitcoinWalk does not upload or retain the city signing secret or remote-signer connection.

## What happens after the host finishes

The row normally changes to **Action required** for the super-admin. The super-admin verifies the host proof, activates the exact city binding and checks the public profile, NIP-05 and Lightning address. The host should not create another identity or repeat a completed signature while that verification is pending.

The city is complete only when its dashboard shows the public activation, NIP-05 and Lightning address as active. If a relay or provider is temporarily unavailable, wait for a recheck rather than replacing valid keys or payment details.
