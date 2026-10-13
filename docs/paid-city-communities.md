# Paid-city community provisioning

BW-23 replaces source-code mappings with an entitlement-bound registry in the
existing application SQLite database. It does not provision or administer an
Armada group, store a Nostr private key, or treat a requested Pro plan as paid.

## Trust boundary

An eligible city must be approved and have a settled `paid_city_entitlement`.
The registry binds its immutable city UUID and entitlement invoice to:

- the current approved canonical slug;
- the exact `wss://chat-<slug>.bitcoinwalk.org/` community relay, kept separate
  from the city's `wss://<slug>.bitcoinwalk.org/` event/replication relay;
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

1. Create the city group in Armada using the dedicated paid-city community relay and keep
   it public and open to join.
2. Copy only the group identifier from its Armada link.
3. As the BitcoinWalk super-admin, open **Monitoring → Communities**.
4. Select the paid city, enter the group ID, and sign **Verify group**.
5. Review the exact city relay, group ID, group name and signed metadata event.
6. Sign the separate **Activate community** action.
7. Open a current city walk in a separate session and confirm that its community
   button resolves to the exact group, while a Basic city still resolves to
   `https://bitcoinwalk.org/join`.

Every list, verification and activation request is a fresh NIP-98-style event
bound to the exact origin, POST route, action and payload. No browser header is
trusted as authorization.

## Remaining acceptance

The implementation is default-empty: no paid-city group is activated by the
release. Staging app `0.3.304` was deployed non-root on 13 October 2026 with
evidence `/home/bitcoinwalk/backups/app-staging-deploy.aLSZdf`; public health
identifies the exact release and an unsigned registry request returns HTTP 403.
It keeps paid-city community transport separate from
the existing city event relay. London currently advertises no NIP-29 support on
`wss://london.bitcoinwalk.org/`, so BW-23 can close only after the separate
`wss://chat-london.bitcoinwalk.org/` service and a real group are created,
verified and activated through the interface, then tested for cross-city
isolation, join/message behavior, restart persistence and fail-closed behavior
when the entitlement or group metadata no longer matches.
