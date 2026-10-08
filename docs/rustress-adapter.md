# BW-100 — isolated provisioning adapter

8 October 2026. First implementation slice, not a live Rustress integration.

## Inventory and boundaries

The user identified the existing instance at `http://213.232.235.240:8889/admin`.
An unauthenticated request returns 401. The user created `bitcoinwalk` with
key-only SSH access on 8 October; agent login was verified as UID 1004 with no
elevated permissions. The separate `codex-audit` account retains only its existing
root-owned read-only helper. No root login was attempted. Do not enter admin
credentials over public plain HTTP.

Read-only inventory found container `rustress`, restart policy `unless-stopped`,
host port `8889` mapped publicly (IPv4/IPv6) to `8080`, and the bind mount
`/root/rustress.db:/app/rustress.db`. The user provided image metadata:

- Configured tag: `ghcr.io/frnandu/rustress:latest` (not changed).
- Immutable repository digest:
  `ghcr.io/frnandu/rustress@sha256:dd82bfc0637138a0e3887276ceb2c0c7842d6b94725077685cf8b76d3953ffb6`.
- Local image ID:
  `sha256:d2d3faad326e6d2b9ab8f45879d667c5178e131345f9f0b0e95ce7b6bf891fd6`.
- Revision label: `c72fdeccd80025d181efc1b1d45baeb8bfbde4a9`.
- Container Config.User is empty: no explicit non-root runtime user configured.

The deployed revision label matches the reviewed source. This identifies the
baseline, not a rebuild/attestation of all image contents. Wallet scopes, mounted
database contents, existing address claims and backup validity remain unchecked.
No Docker group access, generic sudo, container restart or data read was granted
or performed. The database may contain credentials; never copy it into a test
instance or print it for inventory.

The local upstream review checkout is pinned to
`c72fdeccd80025d181efc1b1d45baeb8bfbde4a9`, matching the installed revision label.
Its `/admin/add` handler creates a user and then
inserts Prism splits separately, with compensating deletion on failure. It does
not implement the narrow contract below. We will not automate dashboard login
or write directly to its live database.

`src/rustress/contract.ts` and `client.ts` implement a private, server-side client
for a **new companion API**. They are not imported by checkout, page routes,
background jobs or startup. No environment variable enables this slice. No NWC
secret, live wallet, real city mapping or public endpoint was changed.

## Versioned contract to implement in Rustress

All endpoints require a dedicated high-entropy bearer credential, scoped to
BitcoinWalk-managed entries for one configured domain. Never reuse a browser
admin password or a wallet connection string. Private listener/tunnel only;
public reverse proxy must not route `/v1/bitcoinwalk` or the admin dashboard.

- `GET /v1/bitcoinwalk/capabilities`: exact `bitcoinwalk-provisioning-v1`, reviewed
  upstream commit, SHA-256 adapter artifact revision and configured domain; all
  atomicConfiguration/managedEntriesOnly/compareAndSwap/idempotency/
  invoiceIssuanceGate capabilities true. The client pins every value. A capability
  claim alone is not proof: provider integration/restart tests remain required.
- `POST /v1/bitcoinwalk/cities/{cityId}/prepare`: exact schema-validated config,
  expected prior applied version, deterministic city/version/config-digest key.
  Reserve the domain/local-part claim without enabling public services.
- `POST /v1/bitcoinwalk/cities/{cityId}/apply`: apply only the previously prepared
  exact configuration. Independently recheck authority immediately before calling
  from the eventual orchestration layer. Use an atomic transaction for managed
  user, identity, split, wallet reference and durable idempotency receipt.
- `GET /v1/bitcoinwalk/cities/{cityId}`: minimal receipt with API, cityId, version,
  configHash, prepared/applied state and invoiceIssuance disabled. Never return
  wallet credentials or private proof records.

Prepare and apply are separate phases. Store durable state by city, version and
digest; exact retries return the current state without reapplying a mutation.
Prepare after an already-applied version returns applied, never downgrades it.
An identical already-applied operation must succeed idempotently even though its
expected predecessor is now old. A changed payload with the same version must
conflict. Retain durable receipts and reservations across process restarts.
Address uniqueness applies across ALL users; never claim an unmanaged existing
entry. MEP requires explicit reviewed adoption, not overwrite-by-name. A failed
transaction cannot leave a partial user/split or consume a version.

Only `invoiceIssuance: disabled` is accepted in this initial client. There is no
enable method, payment RPC or secret transport. `walletRef` identifies a wallet
configured separately on the Rustress host. Apply does not mean NIP-05 or LNURL
is publicly verified. BW-19 independently verifies public endpoints; BW-18 must
deliver durable forwarding before a separate reviewed activation API is added.
Disable/update/recovery orchestration also remains future integration work.

Private config hashes cover stable city ID, canonical address, city key, current
authority/approval/brand event IDs, owner-confirmed destination version, payout
destination, wallet reference, integer 7900/2100 basis points and disabled state.
The app client rejects direct city-address payout loops. Full destination DNS,
LNURL validation and managed-city cycle detection must be repeated by the
orchestrator/provider; this schema alone is not payment validation.

## Transport and uncertainty

The first client accepts only `http://127.0.0.1:<port>` with no path, query,
credentials or fragments; use a reviewed authenticated SSH/private tunnel to
the other VPS. No localhost DNS alias or public HTTP exception. Redirects are
rejected, requests have a five-second timeout and responses are capped at 16 KiB.
Credentials use private class fields, never request bodies or error messages.
Provider error bodies are cancelled without parsing. Do not log private configs.

Every write is preceded by a capability check and followed by an independent
status read with exact city/version/hash/state comparison. Timeout, server error,
malformed write response or failed read-back is **unknown**, never success or
proof of failure. There is no automatic write retry. Reconcile status, then retry
the identical operation if needed; never increment the version to evade an
unknown result. The caller must persist its intended configuration before sending.

## Wallet boundary

The Alby Hub skill was consulted for scoped, revocable app connections. Existing
`NwcWallet` remains restricted to make_invoice/lookup_invoice for checkout.
No Hub management command or new connection was executed. Proposed separate
Rustress requirements: get_info, make_invoice, lookup_invoice, list_transactions,
pay_invoice and received-payment notifications. Confirm actual supported scopes,
notification behavior, budget and fee limits against the installed Hub; wallet
advertisement alone does not establish granted permissions. Do not supply real
spending credentials until durable accounting and isolated acceptance pass.

## Next steps

The [durable app workflow](rustress-workflow.md) is now implemented with fresh
authority checks, immutable task persistence, leases and read-before-retry
recovery. Its default-off hooks are wired to branded-city publication and a
separate reconciliation loop. Actual app-code-to-VPS fixture acceptance passed
through a temporary SSH tunnel. Staging app 0.3.197 and persistent restricted
transport are now deployed and verified. An explicitly allowed real-city pilot
remains; no app runtime flag is enabled.

Expanded requirement: BW-19 must invoke this automatically after prerequisites,
not require manual per-city Rustress administration. BW-109 adds a separate
super-admin unsplit-address contract; the existing city client intentionally
rejects anything other than 79/21 and must not be repurposed to create those
addresses. See [standalone address plan](admin-lightning-addresses.md).

The companion API is now implemented as a maintained patch against the pinned
upstream revision. See [patch and reproduction instructions](../integrations/rustress/README.md).
It runs only in isolated mode with a loopback listener, private token and marked
fixture database. It refuses root, unmarked existing databases and wallet keys;
normal upstream mode refuses the fixture database. A separate VPS fixture service
was installed and verified on 8 October, as UID 1004 at 127.0.0.1:8890, using
only an empty marked test database and an on-host generated private token.
No live instance was changed. See the patch README for deployment evidence.

Verification: 14 Rust tests and 14 app adapter tests pass. The actual Rust process
also passes the TypeScript-client HTTP acceptance script: atomic configuration,
lost-response reconciliation, concurrent retries, restart, address conflicts,
drift detection, authentication and public-route denial. These tests use fixture
identities and inert wallet references, not live NWC permissions or provisioning.
The full app suite passes 861 tests across 167 files on Node 24; TypeScript,
changed-file lint and public backlog generation also pass.

1. Non-root access, image/revision pin and mount inventory are complete. Next
   verify the live backup procedure and wallet capability metadata separately.
   The pinned Rust 1.90.0 binary resolves all VPS libraries and passed remote
   fixture tests. A user-owned persistent test service was sufficient; no
   root-owned deployment helper, Docker grant or unrestricted sudo was needed.
   Do not retag/recreate the running Rustress container.
2. The local companion API, transaction rollback, restart, unmanaged-name
   collision and concurrent retry checks are complete. Isolated VPS deployment
   and remote restart/read-back checks now pass. Independent review remains.
3. Establish reviewed private app-to-service transport and persistent application
   tasks. Continue fixture acceptance for wrong token, redirects, network loss,
   drifted versions and unknown outcomes. Do not expose public endpoints.
4. Wire fresh signed app authority, persisted tasks and validated destinations to
   the adapter only after those checks pass. Complete BW-18/BW-19 and BW-102
   before enabling real payments or London's public mapping.
