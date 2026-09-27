# Configure Armada relays for BitcoinWalk

Last reviewed: 27 September 2026

Armada separates relays by purpose. A relay may technically support more than
one purpose, but placing every relay in every section increases metadata
exposure, causes avoidable authentication failures and can publish account data
to a private community. Use the smallest set appropriate to each category.

This guide applies to BitcoinWalk free cities, provisioned paid cities, private
city communities and encrypted messages from BitcoinWalk Guide. Relay settings
do not grant organizer, moderator or super-admin permissions. Those permissions
remain bound to signed BitcoinWalk records and community membership.

## Recommended configuration

| Armada section | Add or enable | BitcoinWalk purpose |
| --- | --- | --- |
| **App relays** | Keep **Use app relays** on. Add `wss://relay.damus.io/` and `wss://nos.lol/`. Armada's current defaults may remain if they are healthy. | Profiles, lists and account discovery. These two relays also let BitcoinWalk Guide find the signed DM inbox declaration. |
| **Community relays** | Free cities: join `wss://chat.bitcoinwalk.org/` through the official BitcoinWalk/Armada link. Paid cities: join only the provisioned `wss://<city-slug>.bitcoinwalk.org/` supplied for that city. | NIP-29 group membership, channels, history and moderation. |
| **Search relays** | Keep Armada's working NIP-50 defaults or use **Reset to defaults**. Leave empty to fall back to App relays. | Searching for people and communities by name. Search configuration does not grant access to a private city. |
| **Direct messages** | Turn on **Use app DM relays**, **Use my own DM relays** and **Message requests**. Under personal DM relays add `wss://relay.damus.io/` and `wss://nos.lol/`, then approve the signing request. | Publishes the signed kind-10050 inbox list used for NIP-17 encrypted delivery, including BitcoinWalk Guide notifications. |

Do not add `wss://relay.bitcoinwalk.org/`, staging relays or replica endpoints as
community or DM relays. They carry calendar/event infrastructure, not the
production global chat or the supported Guide inbox. Testers may use explicitly
assigned staging destinations, but should keep them out of a normal production
profile.

## 1. App relays

App relays carry non-community account data such as the Nostr profile and
personal lists. They are also where Armada looks for another person's signed DM
inbox declaration.

For BitcoinWalk:

1. Leave **Use app relays** enabled.
2. Add:
   - `wss://relay.damus.io/`
   - `wss://nos.lol/`
3. Existing Armada defaults may remain as additional profile/list redundancy
   while they are healthy.
4. Do not place a paid/private city relay here. Account data should not be
   fanned out to a membership-scoped city service.

The **Use my own relays (NIP-65)** switch is optional. It makes Armada also use
a relay list that the same identity published in another Nostr client. Armada
does not use this control to create or rewrite that NIP-65 list.

## 2. Community relays

Community relays are the actual chat servers. Armada calls them trust-the-host
NIP-29 servers: each relay owns its channel state, membership and moderation.

### Free cities

All free BitcoinWalk cities currently share the production community:

- Relay: `wss://chat.bitcoinwalk.org/`
- Verified group: `13bc3a423b4f2954`
- Preferred action: open **Join the community on Armada** from a published
  BitcoinWalk event page instead of typing the group identifier manually.

### Paid cities with private relays

A provisioned paid city uses its dedicated destination:

- Relay pattern: `wss://<approved-city-slug>.bitcoinwalk.org/`
- Group: the exact group from the official BitcoinWalk link or invitation
- Authentication: approve Armada's NIP-42 signing request when prompted

Never guess a paid-city hostname or copy another city's group identifier. A
paid request or payment choice alone does not prove that the relay, entitlement
and community have been provisioned. BitcoinWalk deliberately does not fall
back to global chat when a paid destination is incomplete.

**Privacy boundary:** “private city relay” means membership and relay access are
restricted. Ordinary NIP-29 group messages are stored by the community relay;
do not assume the relay operator cannot read them. End-to-end encrypted Concord
communities and NIP-17 direct messages are separate protocols. Use Direct
messages for private one-to-one information and do not post secrets in a group.

## 3. Search relays

Search relays answer NIP-50 full-text queries for profile and community
discovery. They do not carry BitcoinWalk authority and cannot make a user a
member of a paid/private city.

- Prefer Armada's current defaults or **Reset to defaults**.
- An empty list makes Armada fall back to App relays; search then works only if
  those relays support the query.
- Do not add a private paid-city relay merely to improve global search. Search
  terms and connection metadata are visible to the relay operator.
- If a community's own relay advertises and supports search, use it only when
  local channel search is required and membership has already been provisioned.

## 4. Direct messages

BitcoinWalk uses NIP-17 gift-wrapped messages for Guide alerts and organizer
invitations. The content is encrypted, but reliable delivery still requires a
discoverable inbox.

1. Leave **Turn off direct messages** switched **off**. This top control is a
   kill switch: turning it on stops Armada listening for DMs, even though the
   stored conversations and relay lists remain.
2. Turn on **Use app DM relays**.
3. Turn on **Use my own DM relays**.
4. Add these personal DM relays:
   - `wss://relay.damus.io/`
   - `wss://nos.lol/`
5. Save the list and approve the Nostr signing request. This publishes a signed
   kind-10050 event. Merely adding a relay locally, or sending BitcoinWalk Guide
   a message, does not prove that this event was published.
6. Leave **Message requests** enabled. BitcoinWalk Guide may be an unknown
   sender, so its first alert can appear under Requests rather than the main DM
   list.
7. Typing indicators are optional. Leaving them off reduces real-time activity
   metadata without affecting Guide notifications.

Do not save an empty personal DM list while offline or after a failed read. The
kind-10050 event is replaceable: an explicitly signed empty update can replace a
working inbox declaration. Two independent relays are recommended; adding many
relays exposes more connection and delivery metadata without creating a read
receipt.

BitcoinWalk Guide currently discovers inbox declarations on
`relay.damus.io` and `nos.lol` and will deliver only to an operator-reviewed
allowlist. A relay acknowledgement proves that the encrypted wrapper was
accepted; it does not prove Armada displayed or the recipient read the message.
The current Guide is notification-only and does not read or answer incoming
DMs.

## Verification checklist

Use the same npub in Armada that owns the relevant BitcoinWalk role.

- **App:** the correct profile loads after a restart or second-device login.
- **Free community:** the official global group opens, history loads, and a
  reconnect preserves membership.
- **Paid community:** an entitled member can authenticate and enter only the
  assigned city; a non-member is rejected without exposing private history.
- **Search:** a known public profile can be found without connecting private
  city relays globally.
- **DM discovery:** the current npub has a valid signed kind-10050 event visible
  from at least one configured App relay, listing at least one selected DM
  relay.
- **Guide delivery:** one exact encrypted notification appears in Armada or
  **Message requests**. Relay acknowledgement alone is only a transport result.

### RAG troubleshooting

| Status | Meaning | Next check |
| --- | --- | --- |
| 🟢 Succeeded | Correct npub; signed inbox list discoverable; relay acknowledged; message appears in Armada. | Record the client/device and avoid changing the relay list unnecessarily. |
| 🟠 Partial | Inbox list and relay acknowledgement pass, but Armada shows no message. | Confirm the same npub, **Message requests**, authenticated relay connection and device notification state. |
| 🔴 Failed | Wrong npub, no kind-10050 list, no allowed destination, authentication rejection or no relay acknowledgement. | Correct identity/routing first; do not edit the BitcoinWalk delivery database or treat a retry as a new message. |

## Protocol and implementation references

- [Armada source and relay concepts](https://github.com/soapbox-pub/armada)
- [NIP-17 private direct messages](https://github.com/nostr-protocol/nips/blob/master/17.md)
- [NIP-29 relay-based groups](https://github.com/nostr-protocol/nips/blob/master/29.md)
- [NIP-42 relay authentication](https://github.com/nostr-protocol/nips/blob/master/42.md)
- [NIP-51 relay lists, including search and DM relays](https://github.com/nostr-protocol/nips/blob/master/51.md)
- [BitcoinWalk city chat routing](chat-integration.md)
- [BitcoinWalk Guide delivery boundary](bitcoinwalk-guide.md)
