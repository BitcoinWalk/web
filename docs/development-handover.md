# BitcoinWalk development handover

Reviewed 2 October 2026. Read this first, then the specific design document and
`project-backlog.md`; do not replay the full conversation or old installers.

## Working repositories

- Web: `/home/endo/Work/web`, GitHub `BitcoinWalk/web`, branch `main`.
- Relay: `/home/endo/Work/bw56-relay`, GitHub `BitcoinWalk/relay`, branch `main`.
- Nostr repository owner: `npub1jr8sgwrpuk66n9evk76jnfd6wxept4k3uv2vwjw42fhvzvl3mdes38wwnw`.
  ngit identifiers on `relay.ngit.dev`: `bitcoinwalk-web` and `bitcoinwalk-relay`.
- The old `/home/endo/Work/bw60-web` contains uncommitted historical payment work.
  It is backed up; do not reset, deploy or merge it wholesale. The maintained web
  repository already contains the accepted payment implementation.
- `/home/endo/Documents/Codex/BitcoinWalk-web` is another older checkout with
  ngit configuration. Use the maintained checkout above for new development.
- Remote names differ by checkout. Inspect `git remote -v`, compare branch SHAs,
  fast-forward only, and never force-push to reconcile mirrors.

## Live baseline and operational rules

- `.138`: SSH exclusively as `bitcoinwalk`, never root. App is a persistent
  **user** systemd service, `bitcoinwalk-app-staging.service`, on loopback 3338.
  Verified app health: `app-staging-0.3.129`; relay NIP-11: `bitcoinwalk-organizers-0.8.57`.
- Deploy with `/home/bitcoinwalk/bin/deploy-staging-app <archive>` without sudo.
  No automatic staging rollback; keep deployments simple. Future Docker migration
  is separate work. See `app-staging-runbook.md`.
- Configuration: `/home/bitcoinwalk/.config/bitcoinwalk/app.env`; the earlier
  `~/app.env` is not the service's authoritative configuration path. Never print
  NWC strings, keys, preimages, or environment contents into logs/chat/Git.
- `.240`: Alby Hub and isolated directory/candidate receiver Docker containers,
  behind Nginx Proxy Manager. Do not disturb unrelated containers or expose
  candidate host ports. Existing root access there does not authorize root on `.138`.
- Backup before mutations; preserve user changes and signed history. No automatic
  city approvals, signer actions, endpoint switches, deletions or production cutover.

## Product and trust boundaries

- Signed Nostr events hold cities, organizers, approvals, editor permissions,
  walks and directory authority. Browser storage holds drafts, not authoritative payment state.
- App-owned SQLite `/var/lib/bitcoinwalk-app-staging/payments.sqlite` holds payment
  and entitlement records; use SQLite online backup, never copy a live WAL database alone.
- Basic/Pro checkout: 21,000 sats; server-side NWC `make_invoice` and `lookup_invoice`
  only. Exact invoice hash/amount/preimage evidence establishes settlement. Never
  spend automatically or treat a requested plan as entitlement/provisioning.
- Guide is notification-only; incoming replies are not monitored. Future AI
  capacity is planned, not implemented authority to approve or spend.
- Signer integration must be extension-agnostic (nos2x/SideCar). Read-only dashboard
  navigation must not spuriously request signatures. Preserve role isolation.

## Backlog checkpoint

- BW-17 checkout, BW-56 replication, BW-59 reconciliation, BW-60 directory and
  BW-66 Guide notifications are accepted on staging; retain their detailed evidence.
- BW-61 remains **paused by user**. Candidate `wss://replica.bitcoinwalk.org/`
  passed exact Memphis 7/7 visible-state backfill and repeated restart in 0.8.51/52.
  It is not the live replication destination or a signed directory endpoint.
  Do not repeat backfill/reset or sign a successor without resuming this workstream.
- BW-81 is planned: super-admin Monitoring with Alerts and Relays, bounded status
  checks and explicit stale/unknown/failed states.
- BW-53 is the production gate: selective restore/dependency closure, production
  artifact and hostname rehearsal, credentials/storage separation, final promotion
  manifest and controlled cutover remain. Existing manifest selects Warszawa and
  Szydłowiec only; reconfirm currency before execution. Never migrate all test cities.
- Remove staging domains through a reviewed production build/configuration;
  preserve existing signed URLs. Current package script enforces staging defaults
  and is not a production packager. Payments runtime currently restricts its DB
  to the staging state directory; production configuration support is outstanding.
- BW-18/19/20/23 provisioning and revenue features remain separate from accepted
  checkout. BW-50 announcements wait for production canonical URLs.

## Verification and next step

Use Node 24 and locked dependencies (`npm ci`). Run tests, lint, typecheck/build,
package and packaged smoke for app changes; run Go tests/vet for relay changes.
Report RAG results with exact test counts and distinguish historical acceptance
from checks actually run. Current housekeeping removes five obsolete installer
assertions, so web tests decrease from 466 to 461 without deleting behavior tests.

Read `preproduction-review-2026-10-02.md` for backup evidence and security findings.
Recommended next action: validate and deploy the patched framework release on
staging, then address BW-53 production storage/build and restore rehearsal gates.
Do not reopen paused BW-61 as a prerequisite for unrelated work.
