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
Verified live baseline (9 October 2026): app 0.3.199; managed Rustress transport
is installed but both reservation and activation flags remain off. Relay policy
is unchanged by this release.

## Prepare and activate

1. Check the source commit, GitHub and ngit refs, and CI. Use Node 24 and `npm ci`.
2. Choose a unique release label in `src/app/api/healthz/route.ts`.
3. Run tests, lint, typecheck/build, `npm run release:package` and
   `npm run release:smoke`. Retain the archive and its checksum.
4. Copy both files to the bitcoinwalk account and verify their checksum.
5. Record `readlink -f /opt/bitcoinwalk-app-staging/current` before preparing deployment.
   Run `/home/bitcoinwalk/bin/deploy-staging-app /path/to/app-staging-X.Y.Z.tar.gz --expected-current RECORDED_PATH`.
   The helper preserves deployment evidence, activates a new release and checks
   health. No sudo or automatic staging rollback is required.
6. Verify `systemctl --user is-active bitcoinwalk-app-staging.service`, loopback
   and public `/api/healthz`, static assets and the changed user workflow. Health
   alone does not prove signed-action or payment acceptance.

Keep the previous release and deployment evidence. Never overwrite application
state as a response to a failed code deployment; diagnose before another activation.

## Release collision prevention (0.3.445)

Both environment helpers hold an exclusive, non-waiting lock through activation,
health checks and evidence capture. A stale expected-current path fails closed:
inspect and merge the newly active source instead of blindly updating the argument.
Uploads must use a unique source/hash directory, never a shared version-only path.
The helper snapshots the input before verifying its checksum and extracting it.
One version is permanently bound to one archive digest per environment; identical
artifact retries are allowed, but different contents require a new version even if
the first activation failed. Legacy release directories are checked too.

Packaging requires committed tracked source and a build ID matching that commit.
The artifact includes release-manifest.json with environment, commit and ancestry.
Once the active release has a manifest, a candidate must include its source commit.
The first manifest-bearing release uses the explicitly recorded legacy target as
the bootstrap guard. Staging and production use the same source commit but separate
builds because browser relay settings differ. Never deploy staging assets to prod.

Install app-deploy-guard.sh and validate-app-manifest.mjs beside both helpers.
Production usage is `deploy-production-app ARCHIVE --expected-current RECORDED_PATH`,
where the recorded path comes from the production current symlink. Retain backups
of helpers before updating. Old automation omitting this argument intentionally fails.
An emergency code rollback is a separately reviewed operation: record the failed
release, take the same environment lock, restore only the previous app symlink and
release environment, then restart/check health. Never restore payment data for a
code rollback, remove version reservations, or bypass guards for routine releases.

### Accepted reconciliation — 18 October 2026

App `0.3.445` merges both conflicting `0.3.444` releases (`29cc75f` and
`26ca868`) at source `78f034f66dfe9cea967a456310114b1c4f3423a7`.
The profile subscription/retry fix and Pro/Guide/reviewed payout-provider changes
are retained together. The full suite passed 1,948 tests, including 10 executable
deployment-guard tests; lint had no errors and type checking passed. Both
environment packages passed standalone smoke checks. CI run `39164304489` passed
after documentation-only ID reconciliation and inherited package-check updates
at `b7b5341`; those follow-ups do not change the deployed application or helpers.

- Staging digest: `a83de7c7cc9001ff83a5fa41adace56928597ae05aa368cdefb4c6b08432b69f`.
  Evidence: `/home/bitcoinwalk/backups/app-staging-deploy.ECmcMZ`.
- Production digest: `628a9e8c4e952421a89b4a2e54a9df5e61f316581458571051977f025f73cbf7`.
  Evidence: `/home/bitcoinwalk/backups/app-production-deploy.kZPrau`, including
  the online SQLite backup and exact prior application target.
- Previous helper backup: `/home/bitcoinwalk/backups/app-deploy-guards.Tkceds`.

Both live activations used the installed guard and a recorded expected-current
path. Public HTTPS health, Guide configuration, city-management page and deployed
profile/payout code were checked. Browser staging login rendered successfully;
authenticated signer workflows were not exercised in this release session.
Negative guard tests use disposable fixtures, not attempted production rollbacks.
No payout worker, financial authority, relay service or Guide notification worker
was deployed, and no payment or organizer message was sent by these checks.

## Encrypted notification-state recovery

Web Push subscriptions, private website notices and delivery attempts live in the
same SQLite database as the rest of the app. Keep one consistent recovery unit;
do not copy the four notification tables out of a live WAL database.

As the non-root application owner, create an online snapshot encrypted to the
reviewed offline public key:

```sh
deploy/backup-web-notification-state.sh \
  /var/lib/bitcoinwalk-app-staging/payments.sqlite \
  /path/to/offline-recipient-public.asc \
  FULL_40_CHARACTER_FINGERPRINT \
  /home/bitcoinwalk/backups/notification-state-YYYYMMDDTHHMMSSZ.tar.gpg
```

The creator rejects private key material, recipient substitution, symlink inputs
and an existing output. It stores only ciphertext. On the secure recovery machine
that holds the offline private key, rehearse decryption and verification with:

```sh
deploy/verify-web-notification-backup.sh notification-state-YYYYMMDDTHHMMSSZ.tar.gpg
```

Verification accepts exactly the database, its checksum manifest and a hashed
notification-state report. It restores only into a temporary directory, compares
all four notification table fingerprints and removes decrypted material on exit;
it never replaces the live database. A real database replacement remains a
separately reviewed outage-recovery action using the existing application recovery
procedure.

## Read-only notification schedule

`bitcoinwalk-notification-preview.timer` runs the separately authorized preview
every 15 minutes with up to one minute of jitter. Its service is pinned to the
loopback app route, has a 75-second deadline and logs only the check time and
candidate count. A malformed response or unavailable runner makes the unit fail
visibly in systemd; recipient hashes, proposed copy, endpoints and the bearer
credential are never logged.

The installed unit is deliberately fixed to `GET`. It cannot send notifications,
and the app's independent POST sender remains unavailable unless its separate
enable switch is explicitly reviewed later. Inspect it with:

```sh
systemctl --user status bitcoinwalk-notification-preview.timer
journalctl --user -u bitcoinwalk-notification-preview.service --since today
```

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
