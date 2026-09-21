# BitcoinWalk web staging release and rollback

Read-only audit: 21 September 2026. This documents the running layout and an operator procedure based on it. No deployment was performed during the audit. The original 0.1.0 app installer scripts are absent from this repository.

## Verified running layout

| Component | Observation |
|---|---|
| Public endpoint | `https://app-staging.bitcoinwalk.org/api/healthz` returned HTTP 200 and release `app-staging-0.3.6`; TLS verified and the connection reached `213.232.235.138`. |
| App service | `bitcoinwalk-app-staging.service` is enabled and running. Unit: `/etc/systemd/system/bitcoinwalk-app-staging.service`, with no drop-ins. |
| Process | `DynamicUser=yes`; `ExecStart=/opt/bitcoinwalk-app-staging/runtime/bin/node server.js`; `WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.6`. The private runtime reports Node `v24.21.0`. |
| Listener and cache | The app listens on `127.0.0.1:3338`. The unit owns `CacheDirectory=bitcoinwalk-app-staging` (mode `0700`); the release's `.next/cache` links to `/var/cache/bitcoinwalk-app-staging`. |
| Release layout | Root-owned version directories under `/opt/bitcoinwalk-app-staging/releases/`, including `0.3.5` and `0.3.6`. Each inspected release has `server.js`, `package.json`, `node_modules/`, and `.next/` with `server/` and `static/`. The unit names the release directly; there is no `current` symlink. |
| Proxy | Caddy is enabled and running. Its `app-staging.bitcoinwalk.org` host block in `/etc/caddy/Caddyfile` proxies to `127.0.0.1:3338`, sets security/noindex headers, and blocks `/pilot/*`, `/preview/*`, and `/api/admin/pending` with HTTP 404. `caddy validate --config /etc/caddy/Caddyfile` passed with formatting and redundant-header warnings. |

The loopback health check also returned `app-staging-0.3.6`. Public `/` and `/admin` returned HTTP 200; `/api/admin/pending` and `/preview/radom` returned HTTP 404. These checks establish the live response and proxy boundary, not signer or relay acceptance. Public staging is not access-controlled; `noindex` is not authentication. The app's `endo@bitcoinwalk.org` identity must not be inferred from the staging hostname; `endo@app-staging.bitcoinwalk.org` was reported as an invalid email address.

## Prepare a release

1. Confirm the intended source commit on primary ngit `origin`, the mirrored GitHub CI result, and any feature-specific staging acceptance. Record the current unit `WorkingDirectory` and public/loopback health response before making a change.
2. Choose a new release ID and update the hard-coded `release` value in [`src/app/api/healthz/route.ts`](../src/app/api/healthz/route.ts) to match. Build with Node 24 and explicit staging `NEXT_PUBLIC_READ_RELAYS`, `NEXT_PUBLIC_WRITE_RELAYS`, and `NEXT_PUBLIC_ORGANIZER_INVITE_URL`. These public values are embedded at build time; confirm them before building. Run `npm ci`, tests, lint, typecheck, and `npm run build`. Keep private keys, `.env` files, and databases out of the artifact.
3. Run `npm run release:package` after the build. It copies `.next/standalone/`, adds `.next/static/` and optional `public/`, checks required files, matching build IDs, obvious private-file names, and archive integrity, then writes `release-build/app-staging-X.Y.Z.tar.gz` plus its `.sha256` file. CI runs the same command. Confirm the archive release ID matches the health label and inspect its contents before transfer; the package is an artifact, not a deployment.
4. Verify the SHA-256 after transfer, then extract the package into a **new** root-owned, service-readable version directory under `/opt/bitcoinwalk-app-staging/releases/`. Do not overwrite the running or previous release. Make `.next/cache` a symlink to `/var/cache/bitcoinwalk-app-staging`, as in 0.3.6, so the service can write cache data while `ProtectSystem=strict` keeps the release read-only. This repository still has no VPS installer.

The unit pins `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `PORT=3338`, `NEXT_TELEMETRY_DISABLED=1`, and a server-side geocode search URL. It uses `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `MemoryMax=768M`, and `Restart=on-failure`. Preserve these settings during an ordinary app release. An app update does not require a Caddy edit, relay change, or production/legacy cutover.

## Activate and verify

An operator with server administration rights should save a copy of `/etc/systemd/system/bitcoinwalk-app-staging.service`, then use `sudoedit /etc/systemd/system/bitcoinwalk-app-staging.service` to change **only** its `WorkingDirectory` to the new, fully staged release. Review the diff against the copy before running `sudo systemctl daemon-reload` and `sudo systemctl restart bitcoinwalk-app-staging`. Do not point the unit at an incomplete directory. The `codex-audit` account has no sudo access and cannot perform these steps.

Verify `systemctl is-active bitcoinwalk-app-staging`, the unit's effective `WorkingDirectory`, and `http://127.0.0.1:3338/api/healthz`. Then verify public HTTPS health, the homepage, one static asset, and the expected 404 for `/api/admin/pending` and `/preview/radom`. Compare the health release label with the intended package. Run a signer/relay acceptance check separately for any changed workflow; health alone does not prove it. Keep the prior release directory and unit copy until acceptance is complete.

## Rollback

If activation or acceptance fails, use `sudoedit /etc/systemd/system/bitcoinwalk-app-staging.service` to restore the recorded prior `WorkingDirectory`, review that single-line diff, then run `sudo systemctl daemon-reload` and `sudo systemctl restart bitcoinwalk-app-staging`. Check loopback health, public HTTPS health, and the edge-blocked paths again. `0.3.5` was present at audit time, but always use the release recorded immediately before the attempted update; do not assume a fixed rollback version. Preserve the failed release for diagnosis. An ordinary app rollback does not restore relay data or change Caddy.

If Caddy is changed as a separate operation, validate its candidate configuration before reload and use a backup of the *immediately preceding* Caddyfile for rollback. Do not restore an old backup over later unrelated edits. `/var/backups` contains historical BitcoinWalk backups, but this audit did not validate their contents or identify one as a current app rollback artifact.

Production migration remains separate: rebuild with production public settings, verify domain and relay ownership, preserve staging relay aliases for existing signed links, and only then plan legacy traffic cutover.
