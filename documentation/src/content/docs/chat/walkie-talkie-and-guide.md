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

Guide currently helps with workflow notifications. For a paid Pro city, it privately names the current next action: confirm the payout destination, choose a recoverable city signer (including the verified existing-owner option), submit activation proofs, wait for BitcoinWalk review or publication, and finally publish the verified city profile. The message links to the exact city setup and the [complete city setup procedure](/hosts/complete-city-setup/).

Guide accepts private support questions. AI answers are currently drafted for human review; automatic replies are not enabled. The dashboard remains the source of truth if its state has advanced since a message was created. A relay acknowledgement proves delivery to the configured inbox, not that a person has read the message.

### Bitcoin-only education and support

Guide speaks from a Bitcoin-maximalist perspective and focuses on Bitcoin, BitcoinWalk and the tools needed to use BitcoinWalk. It does not promote other cryptocurrencies, tokens, staking schemes or unrelated topics. Out-of-scope questions receive a brief redirect to Bitcoin or BitcoinWalk.

Sound-money education considers qualities such as scarcity, durability, divisibility, portability and the ability to verify money independently. Bitcoin’s monetary rules are publicly verifiable: participants can run a full node to check transactions and enforce the rules they accept. BitcoinWalk’s perspective values predictable issuance, self-custody and minimizing reliance on trusted intermediaries. These principles are educational; they do not guarantee purchasing power, returns or safety from loss. Guide never asks for signing secrets or wallet backups, and does not make price predictions or personalized investment recommendations.

### Basic and Pro response policy

- Basic accounts receive three delivered Guide support responses, followed by a 24-hour break starting when the third response is acknowledged by the recipient’s inbox relay. Three responses become available again after the break. The allowance belongs to the Nostr account, so reopening a conversation does not reset it.
- Verified current owners and editors of a Pro city are exempt from this Basic cooldown. Requested but unpaid Pro plans do not qualify.
- Retries of the same reply count once. Drafts, incoming questions and automated walk/setup notifications do not count. Historical pilot replies sent before this policy starts do not consume the new allowance.
- Pro availability does not bypass payment approvals, signer protections, the Bitcoin-only scope or the current requirement for human review.

Guide messages never ask for or include private keys, seed phrases, bunker secrets, recovery files, payout destinations, wallet credentials or private activation proofs. There is no plaintext, public-note or legacy-DM fallback.

## Receiving Guide messages

Guide delivers messages to the inbox relays in your account's latest signed NIP-17 inbox announcement (`kind 10050`). The latest valid announcement replaces earlier ones; relay lists from older announcements are no longer used.

The BitcoinWalk web setup publishes these compatible inbox relays:

- `wss://relay.ditto.pub/`
- `wss://nos.lol/`

Guide currently permits delivery to those relays and the following compatible destinations:

- `wss://auth.nostr1.com/`
- `wss://relay.keychat.io/`
- `wss://relay.damus.io/`

Your latest inbox announcement must contain at least one compatible destination. Guide does not send to an arbitrary relay merely because it appears in a signed announcement. This allowlist is a security boundary that prevents an unexpected inbox setting from redirecting private notifications.

Some Nostr clients replace the whole inbox announcement with their own relay. If the replacement contains only a private, unreachable or unsupported relay, BitcoinWalk can still approve the city and publish its first walk, but Guide will retain the welcome message for retry instead of sending it elsewhere.

If a city is live but its Guide message has not arrived:

1. Confirm that Chat is connected with the same Nostr account that owns the city.
2. Open **Chat → Guide** in the BitcoinWalk dashboard and complete **Enable Guide messages** when it is offered.
3. Approve the inbox-setting signature in your signer. The signing secret stays in your signer.
4. Refresh Guide after the signed inbox update is visible. A queued notification may wait for its next automatic retry.

If another client has already published a newer, incompatible inbox list and the dashboard does not offer the setup action, contact BitcoinWalk before creating or approving anything again. Do not resubmit the city or publish duplicate walks to trigger another message.

## Armada and Concord

Armada is presented separately as a Concord-compatible option when the city host enables it. It is not another name for the NIP-29 Walkie Talkie group. Use the labels and links shown on the city page rather than assuming both buttons open the same protocol or conversation.
