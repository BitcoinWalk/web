# City Walkie Talkie provisioning

BW-23 replaces source-code mappings with a city-bound registry in the existing
application SQLite database. Every city receives a NIP-29 Walkie Talkie group.
Basic cities use the shared community relay; Pro cities use their canonical
combined city event/community relay. Concord is a separate, default-off Pro
capability tracked by BW-127.

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

1. Create a distinct city group on its tier-appropriate NIP-29 relay and keep it
   public and open to join.
2. Copy only the group identifier from its Armada link.
3. As the BitcoinWalk super-admin, open **Monitoring → Communities**.
4. Select the paid city, enter the group ID, and sign **Verify group**.
5. Review the exact city relay, group ID, group name and signed metadata event.
6. Sign the separate **Activate community** action.
7. Open current Basic and Pro city walks in separate sessions and confirm that
   each button resolves to its own exact group and tier-appropriate relay.

Every list, verification and activation request is a fresh NIP-98-style event
bound to the exact origin, POST route, action and payload. No browser header is
trusted as authorization.

## Remaining acceptance

The implementation is default-empty: no paid-city group is activated by the
release. Staging app `0.3.304` was deployed non-root on 13 October 2026 with
evidence `/home/bitcoinwalk/backups/app-staging-deploy.aLSZdf`; public health
identifies the exact release and an unsigned registry request returns HTTP 403.
Its earlier `chat-<slug>` paid-city routing is superseded by the confirmed
combined-host design. London currently advertises no NIP-29 support on
`wss://london.bitcoinwalk.org/`, so BW-23 can close only after that existing
event receiver is upgraded in place, its exact event set remains unchanged, a
real group is verified and activated, and Basic-city shared-relay groups pass
cross-city isolation, join/message, restart and fail-closed drift tests.
