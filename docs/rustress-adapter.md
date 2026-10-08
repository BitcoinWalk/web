# BW-100 — isolated provisioning adapter

8 October 2026. First implementation slice, not a live Rustress integration.

## Inventory and boundaries

The user identified the existing instance at `http://213.232.235.240:8889/admin`.
An unauthenticated request returns 401. Non-root SSH as `bitcoinwalk` with the
available deployment key is denied. No root login was attempted. Installed
version, service/container image, wallet permissions and database layout remain
unverified. Do not enter admin credentials over public plain HTTP.

The local upstream review checkout is pinned to
`c72fdeccd80025d181efc1b1d45baeb8bfbde4a9`. This is the reviewed source, not a claim
about the installed version. Its `/admin/add` handler creates a user and then
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

Prepare and apply are separate phases. Store idempotency by phase plus city,
version and digest; retries of either phase must return its original receipt.
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

Verification for this slice: 13 new adapter tests pass; complete suite is 860
tests across 167 files on Node 24.19.0. TypeScript, changed-file lint, public
backlog generation and diff checks pass. These are client/contract fixture tests,
not proof of upstream atomicity, live NWC permissions or successful provisioning.

1. Obtain non-root access to `.240`; inventory image/commit, mounts, networking,
   backup procedure and capability metadata without printing credential values.
2. Implement the companion Rustress API against the pinned source in a maintained
   patch/repository. Bind it privately, enforce authentication, transactional
   ownership-scoped mutations, uniqueness, CAS and durable receipts. Test actual
   rollback, restart, collisions with existing users and concurrent retries.
3. Run the adapter against that isolated patched service with fixture identities
   and no spending credentials. Test wrong token, redirects, network loss,
   drifted provider versions and unknown outcomes. Do not expose public endpoints.
4. Wire fresh signed app authority, persisted tasks and validated destinations to
   the adapter only after those checks pass. Complete BW-18/BW-19 and BW-102
   before enabling real payments or London's public mapping.
