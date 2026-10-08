# Rustress isolated provisioning patch — BW-100

This directory maintains BitcoinWalk's patch against upstream commit
`c72fdeccd80025d181efc1b1d45baeb8bfbde4a9` of `frnandu/rustress`.
The deployed baseline's image digest is
`ghcr.io/frnandu/rustress@sha256:dd82bfc0637138a0e3887276ceb2c0c7842d6b94725077685cf8b76d3953ffb6`.
The running container has NOT been changed to this patch.

## Reproduce locally

1. Clone upstream into a NEW working directory and check out the exact commit
   above. Never reuse the live database, container filesystem or environment.
2. Apply `bitcoinwalk-isolated.patch` with `git apply --check` followed by
   `git apply`. The patch includes its Cargo lockfile and Rust 1.90.0 toolchain.
3. Run `cargo test --locked` and `cargo build --locked`.
4. From the web repository, run:
   `node scripts/test-rustress-api.mjs /absolute/path/to/target/debug/rustress`.
   Use Node 24. This creates a random temporary test token and empty fixture DB,
   starts the actual binary on loopback, calls it through the app's TS client,
   tests restart/retry/drift and deletes only its generated test directory.

The maintained local source checkout is
`/home/endo/Documents/Codex/BitcoinWalk-rustress`. Its origin is a local review
clone, NOT a deployment remote; do not push BitcoinWalk changes to upstream.
The portable patch, acceptance script and contract live in the web repository
and use its existing ngit/GitHub mirrors.

## Mode and credential boundaries

Only `BITCOINWALK_PROVISIONING_ISOLATED=1` selects the new API. This branch is
entered before upstream dotenv loading, admin-password generation or wallet
listeners. It requires a non-root effective UID; binds only 127.0.0.1; registers
no public NIP-05/LNURL/admin endpoints; and loads no NWC credentials.

Configuration names (values must be supplied through a private service setup):

- `BW_PROVISION_TEST_DB`: absolute filename ending `.fixture.sqlite`; existing
  files need the isolated marker. An unmarked existing database is rejected
  before migration. New files are mode 0600. Never use `/root/rustress.db`.
- `BW_PROVISION_TOKEN_FILE`: regular mode-0600 private file holding a random
  32-byte base64url token. Do not put its value in commands, Git or logs.
- `BW_PROVISION_DOMAIN`: one domain, compared on every request.
- `BW_PROVISION_REVISION`: SHA-256 of the tested artifact, pinned by the app.
- `BW_PROVISION_PORT`: loopback port, default 8890.
- `BW_PROVISION_WALLET_REFS`: allow-list of inert fixture references, default
  `isolated-test`. These do NOT connect wallets or carry wallet credentials.

`DATABASE_URL` and `NIP57_PRIVATE_KEY` are rejected in isolated mode. Any stored
non-null NWC URI is also rejected. Normal upstream mode refuses a database with
the isolated marker, preventing accidental exposure after a missing mode flag.
`apply` writes the upstream users/splits shape atomically with NULL NWC and a
durable disabled configuration record. The current API cannot enable payment
issuance, even with a valid token. Fractional payout accounting remains BW-18;
the upstream legacy 79-percent field is configuration only, not a payout engine.

## Protocol and transaction behavior

See `docs/rustress-adapter.md` and `src/rustress/contract.ts` for the private API.
Auth is checked before JSON interpretation. Unknown fields, different domains,
unknown wallet references, changed ratios, enabled issuance and circular direct
payouts are rejected. Bodies are bounded. Error responses are generic and do not
include queries, configuration, destinations or credentials. No access log is
installed in isolated mode.

Prepare acquires a writer lock, checks the latest version and reserves a unique
case-insensitive address. Apply requires the exact preparation and atomically
updates user, split, claim and applied record. Existing unmanaged users are never
adopted, including case variations. IDs/addresses cannot be moved by an update.
Existing prepared versions block newer requests until resolved; cancellation is
not implemented yet. An exact prepare retry after apply returns the advanced
applied state instead of downgrading it. Older superseded versions conflict.
Independent status read-back compares the actual materialized user and split,
not only the saved receipt; drift cannot be reported as success. Configuration
history is retained across updates/restarts.

## VPS fixture deployment — 8 October 2026

The isolated service is installed on `213.232.235.240` under non-root
`bitcoinwalk` (UID 1004). No root login, sudo grant, Docker operation or live
Rustress database access was used. User-owned service persistence was enabled
with `loginctl enable-linger bitcoinwalk`; no broader privilege was granted.

- Unit: `bitcoinwalk-rustress-fixture.service` (systemd **user** service).
- Listener: **127.0.0.1:8890**, no reverse-proxy/public route.
- Root directory: `/home/bitcoinwalk/rustress-fixture` (0700).
- Separate marked DB: `state/isolated.fixture.sqlite` (0600).
- Private token: `secrets/api-token` (0600), generated on the VPS, never printed.
- Binary source: local Rust checkout commit `d2389b4`, upstream plus this patch.
- Uploaded stripped debug artifact SHA-256:
  `796b10d033024b33d0899bc8499f9ab5a7c113a68efcc5c8718c5c38797c41d7`.
- Build: Rust 1.90.0, locked dependencies; x86_64 GNU binary. Required symbol
  versions are at most GLIBC 2.34 / OPENSSL 3.0.0. VPS Ubuntu 24.04 with glibc
  2.39/OpenSSL 3.0.13 resolves all libraries. This is a test artifact, not a
  release/production binary.
- Limits: 256 MiB memory, 25% CPU, 64 tasks, no new privileges, private umask.

`install-fixture.py <expected-sha256>` runs only as bitcoinwalk from an incoming
directory containing `rustress`. It verifies the artifact/libraries, installs a
versioned binary and user unit, preserves an existing private token and restarts
only this named test service. `verify-fixture.py <expected-sha256>` verifies auth,
public-route denial, artifact pin, atomic apply, concurrent/exact retries,
restart/read-back, one fixture user/split, no stored NWC credentials, non-root
PID and loopback binding. Both passed on the VPS. The exact uploaded binary also
passed the local TypeScript-client process test. No real cities are configured.

Operational commands, as `bitcoinwalk` on `.240`:

```sh
systemctl --user status bitcoinwalk-rustress-fixture.service
systemctl --user stop bitcoinwalk-rustress-fixture.service
```

To retire the test service, use `systemctl --user disable --now
bitcoinwalk-rustress-fixture.service`. Preserve its isolated state for diagnosis;
do not delete or alter the live `/root/rustress.db`. Do not disable user lingering
if other user services have since been installed. The live container and its
port 8889 are unchanged; its unauthenticated admin still returns HTTP 401.

## Remaining gates

Any app-to-VPS access must use a reviewed private tunnel limited to this listener;
no tunnel is installed yet. Never expose the fixture API publicly or supply
wallet credentials to it.

This is NOT production-ready provisioning. Remaining work includes BW-109's
standalone no-split resource, app-owned durable orchestration with fresh signed
authority checks, expired-preparation recovery, payout capability validation,
wallet configuration and accounting, public endpoint activation, backups,
remote access controls, independent security review and approved live acceptance.
Endo, donate and London have not been provisioned by these tests.
