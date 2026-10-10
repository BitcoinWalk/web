# Production shared free-city relay

`relay.bitcoinwalk.org` is the shared Khatru relay for free-tier BitcoinWalk city records and organizer-owned NIP-52 occurrences. It is isolated from `relay-staging.bitcoinwalk.org`, `chat.bitcoinwalk.org`, and dedicated paid-city relays.

- Host: `213.232.235.138`
- Backend: `127.0.0.1:3340`
- Service: `bitcoinwalk-relay-production.service`
- Binary: `/opt/bitcoinwalk-relay-production/bitcoinwalk-relay`
- State: `/var/lib/bitcoinwalk-relay-production/events.db`
- Public relay: `wss://relay.bitcoinwalk.org`

The production database was populated through reviewed, selective promotion; it
was never created by copying the staging database wholesale. Staging-only test
records and the destroyed Zooid database were not copied. The production web
application now uses this relay for its public read/write boundary.

The packaged `bitcoinwalk-organizers-0.8.1` policy accepts photo-free city submissions from the registration flow, validates optional approval image URLs, and exposes production-specific NIP-11 metadata. Install the same policy update on staging before testing another new-city submission.

`bitcoinwalk-organizers-0.8.2` completes that compatibility change by accepting an initial NIP-52 proposal without an `image` tag. An optional image is still validated when supplied. This matches the approval-first image workflow introduced by app staging `0.3.36`.

DNS must use an explicit `A` record for `relay.bitcoinwalk.org` pointing to `213.232.235.138`; the legacy wildcard currently points elsewhere. Future paid relay provisioning should call njal.la from a server-side provisioner using a systemd credential. API tokens must not be stored in the web build, Git repository, Nostr events, browser storage, or command history. Provisioning should create the exact city record, confirm authoritative DNS, activate the isolated backend, validate Caddy, obtain TLS, and record rollback state.

## Production acceptance

BW-52 was accepted on 10 October 2026 after a fresh read-only audit confirmed:

- the explicit DNS record resolves to the production host and the public TLS
  certificate covers `relay.bitcoinwalk.org`;
- public NIP-11 metadata identifies the production events relay;
- a bounded WSS read returned 161 scoped signed records across 20 city IDs with
  zero invalid signatures;
- the backend listens only on `127.0.0.1:3340` and runs as a hardened dynamic
  systemd user with its own state directory;
- the active production web build contains `wss://relay.bitcoinwalk.org/` and
  its health endpoint passes; and
- the earlier BW-53 production restart and the later Seattle/Hrpelje additive
  promotion preserved the accepted records without replacing the production
  database with staging wholesale.
