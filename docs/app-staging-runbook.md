# BitcoinWalk staging app deployment

Current procedure, verified 2 October 2026. This supersedes the September 21
root-owned system-unit procedure. Do not use historical sudo installers for
routine app releases.

## Runtime

Connect to 213.232.235.138 as `bitcoinwalk` only. The persistent user manager
supervises `bitcoinwalk-app-staging.service`; use `systemctl --user`.
The service working directory is `/opt/bitcoinwalk-app-staging/current`.
The app listens on `127.0.0.1:3338` behind the existing Caddy host.
Configuration is `/home/bitcoinwalk/.config/bitcoinwalk/app.env`, owned by
bitcoinwalk and mode 0600. It must never enter a build artifact or Git.
For LocationIQ city autocomplete, add `LOCATIONIQ_ACCESS_TOKEN` to this file.
The application consumes it server-side and Photon remains the fallback.
Verified live baseline (6 October 2026): app 0.3.179; relay NIP-11 reports 0.8.59.

## Prepare and activate

1. Check the source commit, GitHub and ngit refs, and CI. Use Node 24 and `npm ci`.
2. Choose a unique release label in `src/app/api/healthz/route.ts`.
3. Run tests, lint, typecheck/build, `npm run release:package` and
   `npm run release:smoke`. Retain the archive and its checksum.
4. Copy both files to the bitcoinwalk account and verify their checksum.
5. Run `/home/bitcoinwalk/bin/deploy-staging-app /path/to/app-staging-X.Y.Z.tar.gz`.
   The helper preserves deployment evidence, activates a new release and checks
   health. No sudo or automatic staging rollback is required.
6. Verify `systemctl --user is-active bitcoinwalk-app-staging.service`, loopback
   and public `/api/healthz`, static assets and the changed user workflow. Health
   alone does not prove signed-action or payment acceptance.

Keep the previous release and deployment evidence. Never overwrite application
state as a response to a failed code deployment; diagnose before another activation.

## Configuration boundaries

Browser `NEXT_PUBLIC_*` values are embedded at build time. Staging application
reads/writes use `wss://relay-staging.bitcoinwalk.org/`; directory discovery uses
`wss://directory-staging.bitcoinwalk.org/` and
`wss://directory-2-staging.bitcoinwalk.org/`. Server reads use loopback 3334.
Calendar discovery is separate. The current staging packager checks these defaults.

NWC stays server-side, configured in the private environment file. See
[payments](city-payments.md). SQLite online backup is required for the payments
database; do not copy only the live main file while WAL is active.

An app release ordinarily requires no relay, DNS or proxy change. Production
needs a separate reviewed build, state/configuration paths, retained signed-link
compatibility and BW-53 acceptance; see [production migration](production-migration.md).
