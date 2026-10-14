---
title: Configure Armada for BitcoinWalk
description: Recommended community and direct-message relay settings.
---

Armada separates relays by purpose. Adding every relay everywhere exposes unnecessary metadata and can route account data to the wrong service.

## App relays

Keep **Use app relays** enabled. Add:

- `wss://relay.damus.io/`
- `wss://nos.lol/`

These support profile discovery and help locate a signed direct-message inbox declaration.

## Community relays

Join a community through the official link shown by BitcoinWalk:

- Basic cities use their city group on `wss://chat.bitcoinwalk.org/`.
- Pro cities use the exact provisioned `wss://<city-slug>.bitcoinwalk.org/` destination.

Do not guess a Pro hostname or reuse another city's group identifier. A requested upgrade or pending payment does not prove that a destination is active.

## Direct messages

Keep direct messages enabled, allow your own DM relays and leave message requests visible. Add `relay.damus.io` and `nos.lol`, then approve the request to publish the signed inbox list. BitcoinWalk Guide may initially appear under message requests.

## Privacy boundary

NIP-29 community messages are stored by the community relay and should not be treated as end-to-end encrypted. NIP-17 direct messages are separate and encrypted. Neither option requires sharing your account secret with BitcoinWalk.
