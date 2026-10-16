---
title: Walkie Talkie and BitcoinWalk Guide
description: Understand public city chat and private Guide messages.
---

## Walkie Talkie

Walkie Talkie is the city conversation in the BitcoinWalk dashboard. It uses NIP-29 groups:

- Basic cities use separate city groups on the shared BitcoinWalk community relay.
- Pro cities use their verified city relay after provisioning.
- Joining, message history and moderation belong to the selected group and relay.

Group messages are intended for community conversation. Do not post passwords, identity backups, payment recovery files or other secrets.

## BitcoinWalk Guide

Guide is a separate private conversation. Guide notifications use NIP-17 encrypted direct messages and never turn the city group into a private-message channel.

Guide currently helps with workflow notifications. For a paid Pro city, it privately names the current next action: confirm the payout destination, connect the separate city signer, submit activation proofs, wait for BitcoinWalk review or publication, and finally publish the verified city profile. The message links to the exact city setup and the [complete city setup procedure](/hosts/complete-city-setup/).

Guide is automated and does not read or answer replies. The dashboard remains the source of truth if its state has advanced since a message was created. A relay acknowledgement proves delivery to the configured inbox, not that a person has read the message.

Guide messages never ask for or include private keys, seed phrases, bunker secrets, recovery files, payout destinations, wallet credentials or private activation proofs. There is no plaintext, public-note or legacy-DM fallback.

## Armada and Concord

Armada is presented separately as a Concord-compatible option when the city host enables it. It is not another name for the NIP-29 Walkie Talkie group. Use the labels and links shown on the city page rather than assuming both buttons open the same protocol or conversation.
