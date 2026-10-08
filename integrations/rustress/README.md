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

## Remaining gates

No VPS fixture service is installed yet; no privileges or live services changed.
Before remote testing, build for the VPS platform, verify the artifact and use
a separate non-root directory/service and empty fixture DB. Do not grant generic
Docker/sudo access. Keep any private tunnel limited to the fixture listener.

This is NOT production-ready provisioning. Remaining work includes BW-109's
standalone no-split resource, app-owned durable orchestration with fresh signed
authority checks, expired-preparation recovery, payout capability validation,
wallet configuration and accounting, public endpoint activation, backups,
remote access controls, independent security review and approved live acceptance.
Endo, donate and London have not been provisioned by these tests.
