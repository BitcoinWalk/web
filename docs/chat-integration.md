# City chat integration

Published `nevent` pages and authenticated previews share one `CityChat`
component. It presents Walkie Talkie as NIP-29 messaging with NIP-17 support and
Armada as the Concord client option. Pro organizers control the two public
surfaces independently. Armada's ordinary HTTPS link uses the stable BitcoinWalk
join alias for the global community or the verified direct destination for a Pro
city. No iframe, self-hosted Armada, custom URI scheme, login automation or
private-key input is used. App opening depends on the user's installed app and
operating-system link settings.

Production app `0.3.302` makes `https://bitcoinwalk.org/join` the stable public
link used by every Basic-city walk. Both `/join` and the retained `/join-chat`
path return a permanent redirect to the exact verified Armada group. The older
`https://chat.bitcoinwalk.org/join` route remains compatible, and the existing
`https://join.bitcoinwalk.org/` proxy host now permanently redirects to the
canonical BitcoinWalk URL rather than the retired form application. Pro-city
walks continue to use only their verified city-specific relay and group.

User-facing setup for Armada's App, Community, Search and Direct-message relay
categories is documented in [Configure Armada relays for BitcoinWalk](armada-relays.md).

## Routing and trust

`src/lib/chat-config.ts` currently selects the verified production global group `13bc3a423b4f2954` on `chat.bitcoinwalk.org`. City destinations are moving to the registry described in [City Walkie Talkie provisioning](paid-city-communities.md). The Khatru relay, HTTPS/WSS, signed metadata, super-admin access and open regular-user joining were human-tested on 23 September 2026.

On 29 September the user confirmed that the obsolete Zooid service is turned off,
completing BW-24. BW-53 retains the post-migration check that Khatru and the public
aliases remain healthy and Zooid does not restart or receive traffic.

- Basic and Pro cities use distinct `bitcoinwalk-<slug>` Walkie Talkie groups on
  the shared `wss://chat.bitcoinwalk.org/` relay.
- Pro cities are registered independently for Walkie Talkie and Armada. The
  shared Walkie Talkie registry is bound to the current paid entitlement; the
  existing Armada destination stays on `wss://<slug>.bitcoinwalk.org/`.
- Missing or invalid evidence fails closed per surface. A missing Walkie Talkie
  group never falls back to another city's group and never changes the Armada
  destination.
- A future Marmot private group is independent and invitation-only. When BW-127 is implemented, it adds an explicitly encrypted native-mobile experience without removing or mirroring the NIP-29 Walkie Talkie room.
- Organizer-supplied legacy `chatUrl` values do not control the rendered button or paid status. No existing signed records are rewritten.
- New walk submissions automatically include the configured global link; the manual URL field is removed. Missing chat provisioning does not prevent submission. The legacy field is now optional, and calendar payloads omit it when absent.

## Unified Chats interface

The app uses one conversation list rather than separate chat products. A regular
participant sees the verified city room, BitcoinWalk Global and their direct
conversations. An eligible organizer additionally sees the role-gated
**BitcoinWalk Guides** room containing the current active-city organizers,
BitcoinWalk Guide and the BitcoinWalk HQ account. NIP-17 Guide notifications and
other direct messages appear in the same list as direct conversations.

The interface labels public community, organizer-only and encrypted direct
conversations clearly, but does not make people choose a protocol. NIP-29 group
messages and NIP-17 direct messages retain their own destinations, membership and
privacy properties; the app never mirrors content between them. Room, account,
draft and attachment state must remain isolated when switching conversations.
BW-133 establishes that shared safety boundary, BW-145 provisions and reconciles
the organizer room, BW-125 carries the same destination model into mobile, and
BW-128 supplies standard direct-message interoperability.

Every current signed city owner sees four suggested avatars in Chats: their City,
BitcoinWalk Guide, BitcoinWalk Global and Organizers. City and Global use the
standard first-use NIP-29 join request. The organizer room is pre-authorized from
the current signed owner roster, so eligible organizers can open it immediately;
arbitrary join requests are never treated as organizer authority. Super-admin
reconciliation creates `bitcoinwalk-guides` as private, restricted and closed,
adds current owners plus BitcoinWalk Guide and BitcoinWalk HQ, removes superseded
owners and requires exact relay-signed metadata and roster read-back. Private
NIP-29 access control is not end-to-end encryption. Guide remains an honest
notification-only NIP-17 destination until BW-128 adds compatible inbound DMs.

After provisioning a real paid relay/group, use **Monitoring → Communities** to
verify signed public/open NIP-29 metadata and then activate the exact destination
with a second super-admin signature. Do not place paid destinations in source
configuration or use placeholder group IDs. No paid group is activated merely by
deploying the registry.

## Verification / launch gates

- Automated tests cover free, dedicated, pending and missing destinations, city isolation, invalid URLs and group IDs.
- Verified 18 September 2026: all 28 tests pass, TypeScript/production build pass, lint has only two existing image warnings. Browser inspection of `/austin` confirms exactly one chat link to the configured official Armada channel, plus the staging notice. Authenticated Radom preview uses the shared component but requires the human's signer for live acceptance; no signing performed by this change.
- Check `/austin` for the single staging link; `/preview/radom` uses the same component after human signer authentication.
- Existing chat relay privacy and membership rules remain unchanged: open joining, members-only messages. The web button does not grant membership.
- Production global routing is active in configuration. Re-test the button on a deployed free-tier `nevent` page, live cross-user delivery, reconnect/history and non-member read rejection. Paid provisioning remains separate and never falls back to the global group.
- BW-48 acceptance on 13 October 2026: all 1,565 tests, lint, staging and
  production builds, and both packaged smoke tests passed. Non-root deployment
  evidence is `/home/bitcoinwalk/backups/app-staging-deploy.khqrHs` and
  `/home/bitcoinwalk/backups/app-production-deploy.3icBsd`. Public read-back
  returned the expected bounded redirect chain for all four aliases, and an
  exact Hamburg walk page rendered `https://bitcoinwalk.org/join`.
