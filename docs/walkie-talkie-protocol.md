# Walkie Talkie protocol decision

Decision confirmed on 13 October 2026: BitcoinWalk uses NIP-29 for the public
Walkie Talkie and reserves Marmot/MLS for a later invitation-only Private group.
Armada uses Concord and is presented as a separate client option, not as the
name of the Walkie Talkie protocol surface.

## Product boundary

### Walkie Talkie

- Available to every approved Basic and Pro city.
- Uses NIP-29 with a shareable `naddr` group link and optional invite code.
- Basic cities use distinct groups on `wss://chat.bitcoinwalk.org/`.
- Pro cities use distinct groups on their combined
  `wss://<slug>.bitcoinwalk.org/` event/community relay.
- Supports the existing Nostr identity and NIP-46 browser-signing path.
- Uses NIP-29 for group messaging and retains NIP-17 support for compatible
  direct messages and invitations.
- Is independently shown or hidden by the current organizer through an exact
  signed ON/OFF command.
- Is described as relay-readable. It must never be labelled end-to-end
  encrypted or used for secrets.

### Armada

- Uses Concord and opens through the reviewed Armada community URL.
- Is an independently controlled public option. Its signed ON/OFF toggle does
  not enable, disable, rename or delete Walkie Talkie.
- Hiding Armada removes its public link but preserves the underlying community,
  membership and history.

### Private group

- Future, optional and invitation-only; it is not a Pro entitlement benefit by
  default and is not required to join a city Walkie Talkie.
- Uses Marmot/MLS for end-to-end encryption, forward secrecy and
  post-compromise recovery properties.
- Uses targeted KeyPackage/Welcome invitations rather than a public group URL.
- Stores MLS state and keys on participating devices. NIP-46 can authorize the
  Nostr identity but cannot replace MLS state backup, recovery or multi-device
  enrollment.
- May later carry encrypted messages over BLE as well as Nostr transports. No
  message is mirrored into or out of the NIP-29 room.

## Why NIP-29 is first

NIP-29 matches the immediate city-community requirement: one-click links,
browser/PWA compatibility, relay-enforced membership and moderation, simple
history recovery and the current Armada client. Its cost is explicit trust in
the hosting relay for message content and membership metadata.

Marmot is a better foundation for private and intermittently connected groups,
but it adds targeted invitation, MLS convergence, device recovery and
multi-device state requirements. White Noise currently provides native mobile
Marmot support and notifications, while the BitcoinWalk NIP-46 web flow and a
BitcoinWalk BLE mesh would require separate integration work.

## Marmot readiness gate

BW-127 must begin with an isolated two-device interoperability spike, not a
production toggle. It must prove:

1. targeted invitation and verified Nostr identity binding;
2. join, message, removal and rejoin across iOS and Android;
3. content-free notifications without leaking group or sender identity;
4. restart, backup, lost-device and multi-device recovery;
5. compatibility with the adopted Marmot version used by White Noise;
6. partition/rejoin behavior before any BLE transport is introduced; and
7. BLE replay, TTL, deduplication, ordering and membership-change safety before
   multi-hop forwarding is enabled.

Until all gates pass, NIP-29 is the only feature presented as **Walkie Talkie**.
