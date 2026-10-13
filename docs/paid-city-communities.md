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
6. The current organizer opens **Upgrade your city**, previews the Pro setup and
   independently signs the **Walkie Talkie** and **Armada** ON/OFF controls.
   Walkie Talkie is the NIP-29/NIP-17-compatible messaging surface; Armada is
   the Concord client option. Neither toggle deletes the underlying community,
   membership or history.
7. Open current Basic and Pro city walks in separate sessions and confirm that
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
created, independently verified and activated London group `bitcoinwalk-london`; signed
metadata event `5e287d3d250a9a985607e01187aa285eea2404eb989b84ef6aca1d2bf3517f2d`
is retained in the existing application database with phase `active`.
App `0.3.310` is deployed non-root to staging with evidence
`/home/bitcoinwalk/backups/app-staging-deploy.quj0i5`. It migrates Pro routing
from the obsolete `chat-<slug>` host to the canonical combined host, keeps the
three signed actions distinct, and hides completed signing controls so the UI
shows only the next required action. It also makes the verification evidence
fingerprint independent of mutable database fields; an unchanged signed group
now remains exact during activation recheck. App `0.3.311` changes the safe
production migration policy: Walkie Talkie starts OFF while Armada starts ON,
or retains its earlier hidden state. Environments where Walkie Talkie was
already explicitly initialized or enabled retain that stored choice. The
current organizer can subsequently sign exact independent visibility
commands; public city and walk pages describe **Walkie Talkie** as NIP-29 with
NIP-17 support and **Armada** as Concord. A canonical relay URL with or without
a trailing slash resolves identically. BW-23 can close only after
Basic-city shared-relay groups pass cross-city isolation, join/message, restart
and fail-closed drift tests.

Production app `0.3.311` was deployed non-root on 13 October 2026 with evidence
`/home/bitcoinwalk/backups/app-production-deploy.Evsr97`. Public health and the
London city page returned HTTP 200. The production database migration exposes
the independent columns with exact defaults `walkieTalkieEnabled=0` and
`armadaEnabled=1`, and contains no invented provisioning rows. London therefore
remains hidden until the super-admin freshly verifies its existing signed group
metadata and separately activates that exact evidence against the production
origin.

The super-admin completed that production verification and activation on 13
October 2026. Release `0.3.315` adds a separately signed channel-name action for
an active group. It publishes NIP-29 kind `9002` to the exact registered relay,
then accepts the change only after the relay returns a new signed kind `39000`
metadata event with the requested name. The registry refresh preserves the
group ID, activation time, visibility controls, membership and history. Channel
metadata stores `chat`; clients conventionally present it as `#chat`.
The release is active non-root on staging and production; deployment evidence is
`/home/bitcoinwalk/backups/app-staging-deploy.fgxxqw` and
`/home/bitcoinwalk/backups/app-production-deploy.eeGysZ`.
