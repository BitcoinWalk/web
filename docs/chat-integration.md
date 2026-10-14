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

- Every city uses a distinct city-scoped group on the shared `wss://chat.bitcoinwalk.org/` relay.
- Pro cities are registered by immutable city UUID in both the verified entitlement registry and community registry, with their expected slug and group ID. An incomplete Pro destination shows setup required and never falls back to another city's group.
- A city NIP-29 destination must use the shared relay and canonical `bitcoinwalk-<slug>` group ID. Paid event relays remain separate from chat transport.
- A future Marmot private group is independent and invitation-only. When BW-127 is implemented, it adds an explicitly encrypted native-mobile experience without removing or mirroring the NIP-29 Walkie Talkie room.
- Organizer-supplied legacy `chatUrl` values do not control the rendered button or paid status. No existing signed records are rewritten.
- New walk submissions automatically include the configured global link; the manual URL field is removed. Missing chat provisioning does not prevent submission. The legacy field is now optional, and calendar payloads omit it when absent.

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
