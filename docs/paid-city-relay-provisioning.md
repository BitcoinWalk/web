# Paid-city relay provisioning

BW-20 turns the accepted London container pattern into a repeatable, fail-closed workflow. It does not infer payment from a requested plan and it does not give the web process access to Docker or Nginx Proxy Manager.

## Authority and flow

1. A super-admin publishes an exact signed city approval.
2. The application independently reads that approval back and verifies a durable settled Pro entitlement in its existing payments SQLite database.
3. The application inserts one idempotent task keyed by city UUID. Its immutable evidence commitment includes the approved revision, approval event, canonical slug, payment hash and the fixed replication-service public key. A conflict stops for review.
4. A credential-scoped worker on the paid-relay host leases one task. The API never returns an invoice, preimage, NWC connection, signer key or payout destination.
5. The host creates one city-scoped Khatru container. It runs as UID/GID 65532, has a read-only root filesystem, a bounded private tmpfs, no Linux capabilities and no host-published ports. Its database is a separate 0700 state directory.
6. The provisioner proves an exact empty city state, gateway routing and restart stability before reporting a bounded set of booleans. Raw host diagnostics stay in the local system journal and recovery evidence directory.
7. The application independently checks public DNS, TLS, HTTPS health, WSS and exact NIP-11 naming. Owner-signed directory activation and source replication remain distinct gates, so infrastructure alone never turns the full Requests checklist green.

When `BITCOINWALK_RELAY_PROVISION_ENABLED=1`, the app also reconciles the approved directory every 30 seconds. This queues eligible paid cities approved before the worker was introduced without asking the organizer or super-admin to approve them again. Relays already marked ready, such as the accepted London deployment, are excluded.

The app's ordinary `bitcoinwalk` service remains non-root. A small root-owned oneshot on the Docker host is the only privileged boundary because the accepted `.240` topology uses rootful Docker. It receives no wallet or organizer secrets. Every gateway and city relay process inside Docker is non-root.

## One-time wildcard gateway

The existing `*.bitcoinwalk.org` DNS record and wildcard certificate terminate at Nginx Proxy Manager on `.240`. NPM needs one operator-managed upstream only:

- Forward hostname: `bitcoinwalk-city-relay-gateway`
- Forward port: `8080`
- Scheme: `http`
- WebSocket support: enabled
- Existing wildcard certificate and forced HTTPS: retained

The gateway reads a root-owned allowlist. It never derives an upstream from an arbitrary request hostname. Unknown subdomains return 404; a corrupt or unreadable registry returns 503. London can retain its explicit proxy-host record while the wildcard handles newly provisioned cities.

## Durable states

- `queued`: exact paid approval is waiting for the host worker.
- `leased`: one worker owns a short, recoverable attempt.
- `provisioned`: container isolation, empty-state audit, gateway route and restart passed.
- `needs-attention`: scope and attempt count are retained; retry requires operator review.

Expired leases are safe to reclaim. The host provisioner is idempotent only when the stored manifest digest exactly matches; a changed city, slug, approval or entitlement fails rather than replacing infrastructure.

## Readiness and rollback

Provisioning completion is not the same as public activation. Requests remains amber until public DNS/TLS/WSS/NIP-11 succeeds and the city owner publishes the required directory state. Replication is enabled through the existing signed-entitlement registry and remains independently auditable.

Every first-time host change records the prior gateway allowlist, Docker inventory, container inspection, empty audits and accepted scope beneath `/var/backups`. A failed first apply restores the old allowlist and removes only the newly created container/state. Existing city containers, London routing, NPM, source relay, Guide and app data are not modified.
