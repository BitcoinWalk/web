# City Walkie Talkie provisioning

BW-23 replaces source-code mappings with a city-bound registry in the existing
application SQLite database. Every city receives a NIP-29 Walkie Talkie group.
Basic cities use the shared community relay; Pro cities use their canonical
combined city event/community relay. A future invitation-only Marmot private
group is a separate product surface tracked by BW-127; it never replaces or
mirrors the NIP-29 room.

## Trust boundary

An eligible city must be approved. The registry binds its immutable city UUID
and current tier to:

- the current approved canonical slug;
- the shared `wss://chat.bitcoinwalk.org/` relay for Basic cities, or the exact
  combined `wss://<slug>.bitcoinwalk.org/` event/community relay for Pro cities;
- one relay-scoped Armada group ID;
- the NIP-29 kind `39000` metadata event signed by the exact NIP-11 `self`
  identity of that relay; and
- a digest of the complete verification evidence.

Verification accepts only valid relay-signed metadata for the exact group and
requires the relay to advertise NIP-29. Groups marked `private` or `hidden` are
rejected. Buzz's always-present `closed` tag describes explicit membership; its
open channels still accept self-join requests, so it is not treated as private.
The `(relay, group ID)` pair is unique,
and public routing includes only separately activated records whose original
settled entitlement still exists. An active destination cannot be overwritten;
replacement requires a future explicit revocation workflow.

## Operator workflow

1. As the BitcoinWalk super-admin, open **Monitoring → Communities**.
2. Select the city and review the generated city-scoped group identifier.
3. Sign **Create group**. The exact tier-appropriate relay creates the group and
   signs its public discovery metadata; no relay private key reaches the app.
4. Review the exact city relay, group ID, group name and signed metadata event.
5. Sign the separate **Activate community** action.
6. Open current Basic and Pro city walks in separate sessions and confirm that
   each button resolves to its own exact group and tier-appropriate relay.

Every list, verification and activation request is a fresh NIP-98-style event
bound to the exact origin, POST route, action and payload. No browser header is
trusted as authorization.

## Remaining acceptance

The implementation remains default-empty until the super-admin performs the
three signed actions. London was upgraded in place to combined relay `0.9.0` on
13 October 2026. Its event set remained exact, the NIP-29 store remained empty
and separate across restart, its rehearsed relay identity stayed unchanged,
and unauthorized creation remained denied. Evidence:
`/var/backups/bitcoinwalk-london-combined-activation.5wFeIQ` and
`/var/backups/bitcoinwalk-london-public-walkie-talkie.P5wwQn`. The super-admin
created and independently verified London group `bitcoinwalk-london`; signed
metadata event `5e287d3d250a9a985607e01187aa285eea2404eb989b84ef6aca1d2bf3517f2d`
is retained in the existing application database with phase `verified`.
App `0.3.306` is deployed non-root to staging with evidence
`/home/bitcoinwalk/backups/app-staging-deploy.LPG2nL`. It migrates Pro routing
from the obsolete `chat-<slug>` host to the canonical combined host, keeps the
three signed actions distinct, and hides completed signing controls so the UI
shows only the next required action. BW-23 can close only after London is
activated through that UI and Basic-city
shared-relay groups pass cross-city isolation, join/message, restart and
fail-closed drift tests.
