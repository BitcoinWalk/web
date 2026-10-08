# BW-18 — isolated durable payout accounting core

8 October 2026. Local implementation and fixture tests only. No live wallet,
checkout, Rustress service, Madeira fixture or deployment changes.

`src/rustress/payout-ledger.ts` implements SQLite accounting for the planned
79/21 payout worker. It is not imported by runtime code and exposes no HTTP or
NWC interface. Existing Rustress forwarding is not replaced or enabled by this
slice. A production integration must select one authoritative payout engine;
never run this alongside legacy forwarding for the same incoming payment.

## Implemented invariants

- Save an immutable incoming-invoice snapshot before exposing the invoice:
  receiving-wallet reference, payment hash, city, destination version/address
  and exact millisatoshi amount. Conflicting retries cannot rewrite it.
- Exact settlement credits `floor(received_msat * 79 / 100)` once, with the
  remainder retained. Invoice update and obligation creation are transactional.
  Duplicate notifications/reconciliation calls cannot create a second credit.
- Money uses decimal strings and BigInt, never floating point or SQLite SUM.
  Each input is bounded by bitcoin's maximum monetary supply in millisatoshis.
- Credits are grouped only by city, wallet and immutable destination version.
  Old invoices keep their destination. Small amounts remain owed; whole-satoshi
  quotes respect recipient minimum/maximum amounts and retain residual dust.
- Each payout atomically reserves exact allocations from incoming obligations.
  Insufficient credit, stale quotes, duplicate hashes and conflicting attempts
  fail without partially reserving funds. SQLite writer transactions serialize
  allocation across workers.
- The send claim changes prepared to unknown **before** any future external send.
  Only one worker can claim it. Crash/timeout leaves the amount reserved; no
  restart, expiry or retry automatically releases it or sends it again.
- Only a never-claimed prepared attempt may be cancelled and release its credit.
  A definitive-failure recovery path is deliberately not implemented yet;
  unknown outcomes remain owed/reserved pending trustworthy reconciliation.
- Completion requires exact wallet/hash/amount and a matching payment preimage,
  supplied by a future trusted wallet lookup. The preimage is not stored.
  Successful retries remain paid. Conflicting fee evidence requires review.
- Fees are separate from the organizer's full share. A confirmed excessive fee
  is recorded as paid with a durable warning, never retried as another payout.
  User approved BitcoinWalk covering routing fees on 8 October 2026. Organizer
  allocation remains 79%; BitcoinWalk nets 21% minus fees. This approval does
  not authorize unlimited spending, a wallet budget or a live payment test.

## Outgoing invoice and worker slice

`outgoing-invoice.ts` validates signed BOLT11 invoices using the pinned decoder:
exact amount and network, whole-satoshi recipient limits, unique payment hash,
exact LNURL metadata commitment and bounded expiry. Amountless invoices and
description-only invoices are rejected. Errors never include the invoice.
Testnet and signet share a prefix; the future wallet collector must bind the
actual chain independently.

`payout-worker.ts` stores the invoice and terms atomically with reservations.
It requires fresh injected authorization, rechecks expiry after authorization,
claims once before sending and independently looks up settlement. Only an exact
wallet/hash/amount plus matching preimage completes payment. A missing, failed
or pending lookup leaves funds reserved; it never triggers another send.
Restart reconciliation works even after invoice expiry. Expired unsent attempts
remain prepared until explicitly cancelled/replaced; nothing silently drops debt.

This is a single-attempt worker with synthetic adapters, not a running queue or
NWC transport. Adapters must enforce timeouts, budgets and fees. Authorization
must come from fresh trusted server evidence, not a browser flag. Private invoice
documents must never be exposed through public status APIs; preimages are not stored.

## Recipient retrieval and lookup validation slice

`recipient-invoice.ts` retrieves recipient metadata and a matching invoice from
the immutable obligation's saved address. It does not reserve credit or pay.
HTTPS transport pins a checked public IPv4 address while retaining the original
TLS hostname, rejects redirects/compression/non-JSON, caps bodies at 64 KiB and
uses a seven-second total deadline including DNS. All resolved addresses must
pass the conservative IPv4 policy: dual-stack and IPv6-only providers currently
fail closed. BitcoinWalk endpoints and cross-origin callbacks are rejected.
Cross-origin providers need a reviewed explicit allow-list, not a blanket bypass.
Amount, bounds, exact metadata commitment and BOLT11 checks remain mandatory.
Transport injection is for trusted internal testing, never browser input.

`wallet-lookup.ts` validates outgoing settled lookup records against the exact
requested hash, safe integer amounts/fees and matching preimage, and binds the
result to a configured private wallet reference. Pending/failed/unknown outcomes
stay unresolved. It does **not** authenticate a real wallet: the future transport
must verify connection identity, response signature and request correlation.
No credentials, live HTTP requests, wallet calls or runtime imports were used
in this slice. Checkout's receive-only adapter is untouched.

## Authenticated read-only NWC slice

`nwc-reader.ts` now supplies a separate NIP-44 encrypted NWC reader with only
`get_info`, bounded `list_transactions` pages and `lookup_invoice`. It verifies
wallet signatures, exact request/recipient tags, result method and timestamps,
rejects duplicate correlation tags and uses unique request nonces. Verification
reconstructs wire fields rather than trusting a mutable event's cached result.
Timeouts and failures close subscriptions/connections and redact wallet errors.
Relay failover happens only before publication; no request is replayed afterward.
Legacy-only encryption fails closed. Connection relays must come from trusted
private server configuration, not user-supplied API requests.

The reader rejects the checkout client key even under a different reference.
Its internal wallet/client fingerprint must be pinned to the immutable inventory
mapping before runtime use; a display label alone is not connection identity.
`lookupPayout` combines authenticated transport with the outgoing preimage/amount
validator. History and get_info remain raw authenticated read results: inventory
permissions, network/schema validation, budget collection and paginated catch-up
still need a collector. Advertised methods never establish granted permissions.

There is no send method, public route, credential installation or live probe.
The standard [NIP-47 pay_invoice request](https://github.com/nostr-protocol/nips/blob/master/47.md#pay_invoice)
does not specify a maximum-routing-fee parameter. Do not invent one or assume it
is enforced: verify provider-specific fee control before adding sending. Keep
explicit spending approval, budget/fee policy and restore reconciliation gates.
All adapter tests use synthetic keys and mocked relays; none use the user's Hub.

## Integrated isolated flow

`payout-flow.ts` connects saved incoming invoice snapshots, exact bound-wallet
settlement lookup, the allocation ledger, protected recipient retrieval and the
restart-safe worker. A settled incoming response must match direction, hash,
amount, timestamp and preimage before it is credited. Duplicate collection is
idempotent. Unknown invoices never create obligations from wallet history alone.

Bounded scans recheck registered unsettled invoices after missed notifications.
Start each full scan at cursor zero; failed/pending rows remain eligible for the
next scan. This is callable recovery logic, not a deployed background scheduler.
Issuance must still register its verified snapshot before exposing an invoice.

Payout preparation selects the immutable destination from a saved incoming hash,
reads recipient limits, quotes the available whole-satoshi allocation, validates
the returned invoice and atomically reserves credit. Retrying the same attempt
reuses its stored invoice. Endpoint failures and recipient minimums retain debt.
Recipient maximums/per-payout limits leave the remaining obligation available.

Reader and sender fingerprints must agree and are persistently bound to the
wallet reference. Reusing a label for a different connection fails closed;
credential rotation needs an explicit reviewed migration. Authorization requires
fresh matching readiness evidence, network, non-renewing budget and fee controls.
An atomic wallet-wide lifetime claim counts paid principal/actual fees and unknown
principal/reserved fees across cities. Two claims cannot each consume the same
remaining local allowance. Prepared attempts denied a claim stay prepared.

This remains an **isolated integration harness** with explicit injected sender,
reader, evidence source and HTTP transport. There is no default live sender,
credential loading, public endpoint or runtime import. Test budgets are fixtures,
not approved real limits. The local lifetime budget is not Hub's entire wallet
budget: it cannot account for payments outside this ledger, and does not replace
fresh inventory, exclusive connection ownership or Hub-side enforcement. Restore
of an older ledger must still be reconciled before any send is allowed.

## Older-backup restore quarantine

`payout-recovery.ts` adds a separately persisted send journal and an in-memory
startup gate. The integrated flow now refuses new send claims if the recovery
guard is absent or paused. A successful budget claim changes the local attempt
to unknown, then the journal durably records its immutable allocation/invoice
commitment **before** the wallet send. A failed journal write cannot send and
leaves the allocation reserved. Journal uniqueness prevents a second claim.

Reconciliation requires complete authenticated outgoing history for the exact
exclusive wallet connection and exact lookups/preimages for journaled payments.
A restored prepared attempt with an exact journal commitment is quarantined as
unknown and, only with matching proof, confirmed paid without being sent again.
If the backup lacks the attempt or its allocations, recovery blocks rather than
guessing which city was paid. Unknown outgoing history, altered allocations,
cancelled-but-journaled attempts, missing journal records, invalid proof, incomplete
history, pending/failed/missing payments and unavailable wallets all block sends.
An explicit pause cannot be overridden by a late audit response.

This is isolated recovery logic, not a production restore tool. Before rollout:

1. Stop and fence **all** sender processes before restore/audit. Process-wide or
   distributed fencing is not implemented by this in-memory gate. Never replace
   a database underneath a running sender.
2. Keep the send journal outside the ledger's restore/rollback failure domain,
   with protected durable storage and independent backups. Tests use separate
   SQLite files; this does not establish real infrastructure durability.
3. Supply a real authenticated history collector that proves full pagination and
   retention coverage. The injected `complete` flag is a trusted collector result,
   not a browser input or proof derived from one empty page. Missing history
   coverage means blocked, including when both databases were rolled back.
4. If allocations are missing, recover a consistent newer ledger/journal from
   independent evidence. No automatic reconstruction or manual “mark unpaid”
   bypass is supplied. Uncertain funds stay reserved even if no send occurred.
5. Only after full reconciliation may this harness enable claims; fresh wallet
   permission, fee/budget checks and live-test authorization still apply.

## Full-history collector and storage preflight

`recovery-history.ts` consumes the authenticated reader's recovery-specific
history method. It requests outgoing transactions **including unpaid records**,
uses pages of at most 50 and validates Hub's `total_count`. It rejects malformed
records, duplicate hashes, early short pages, changing totals and inventories
over 10,000 entries. Two scans must return identical normalized records. Failed
and pending sends remain in the result, not filtered out. Errors return an
incomplete result without wallet details. Exact settlement proof remains a
separate lookup in the recovery gate.

These parameters follow the reviewed
[Hub v1.24.0 history controller](https://github.com/getAlby/hub/blob/d8ef0e70e0d265a8424276daee0a595ac31993c0/nip47/controllers/list_transactions_controller.go).
The general history reader is unchanged; recovery uses its own unpaid-inclusive
method. This collector intentionally fails closed for incompatible providers.

Two stable scans do **not** prove that older history was never deleted. A separate
trusted coverage provider must attest the exact connection binding, its start
time, retained-history boundary, exclusive use and a current stopped-sender fence.
Coverage expires, must be fresh within 60 seconds and is checked before/after
the scans. The fence identity must remain unchanged. No real coverage provider
has been installed: browser input or `get_info` must never supply this evidence.

`journal-storage.ts` is a read-only deployment preflight. It requires existing
canonical private files and parent directories owned by the non-root runtime
user, no symlinks/hardlinks, disjoint directories and different filesystem device
IDs. Memory-only, shared-device and nested paths fail closed. It does not create
files, change permissions, mount disks or establish independent backups. A
different device ID is necessary for this initial policy, not sufficient proof
of independent physical failure/backup domains; operators must audit those.

`recovery-controller.ts` composes the reader, collector, preflight and restore
gate. Storage paths are taken from the actual open SQLite handles, not caller
labels. The restore gate now requires storage readiness before reconciliation,
before reopening and before journal claims. With no storage verifier it stays
blocked. Tests simulate topology; no VPS mounts or live wallet queries were made.
Restore operations must still stop all senders and re-open handles: replacing
files under an existing SQLite connection is not a supported deployment workflow.

## Read-only VPS storage audit — 8 October 2026

Verified both existing app and Rustress VPS hosts over key-only SSH as non-root
`bitcoinwalk`, using mount/block-device/space/ownership metadata only. Neither
host has a separate data volume: application data, home directories and existing
app-host backups share that host's main filesystem. The Rustress host's separate
boot partition is on the same disk and is not a journal-storage candidate.
Matching device numbers across hosts do not imply the same physical disk; device
IDs are host-local. No databases, credentials or backup contents were read.

There is currently **no acceptable local journal location** under the implemented
separate-filesystem policy. Changing directory names or creating a loop-mounted
file on the same disk would not establish an independent failure domain.

Options reviewed (user selected option two on 8 October 2026):

- Provision a separate persistent data volume with independently managed backup
  and restore procedures, then privately provision journal storage as non-root.
  Provider durability/failure-domain claims must be verified; a new device alone
  does not establish independent physical redundancy.
- Alternatively, implement a dedicated durable journal service on the other
  existing VPS, with authenticated synchronous acknowledgements, idempotent
  claims, outage refusal and independent backup policy. The current local SQLite
  adapter does not support that topology; do not put SQLite on SSHFS/NFS as a
  shortcut or infer that the existing provisioning tunnel authorizes journal RPCs.

Selected direction: build the authenticated remote journal service on the other
existing VPS. Require synchronous durable acknowledgements before sending,
idempotent claims, strict client/wallet binding, sender fencing and refusal to
send during journal outages. Do not weaken the local-filesystem preflight to
pretend a remote service is a local SQLite file. Independent backup/restore and
failure-domain checks remain required. The user also explicitly approved
publishing these audit notes to GitHub and ngit.

No volume, mount, directory, permissions, service or deployment was changed.
Payout activation remains blocked pending remote-journal implementation and the
other live readiness gates. No purchase or broader server access is authorized
by this choice.

## Remote journal implementation — local service slice

Option two now has a server factory, persistent store, bounded client and remote
recovery adapter under `src/rustress/remote-journal-*.ts`. No listener starts on
import and no environment flag activates it. A localhost HTTP test exercises the real request handler using synthetic
credentials and temporary databases, not either VPS or a wallet.

- One immutable wallet binding and pinned service identity per database.
  SQLite WAL with FULL synchronous writes; an acknowledgement follows COMMIT.
  Append-only claims contain hashes/commitments, not invoices, destinations,
  wallet secrets or preimages. Unique attempt IDs and payment hashes reject
  conflicting claims. No deletion or arbitrary database API exists.
- Loopback requests only, separate client/operator bearer credentials, strict
  schemas, bounded bodies/pages/timeouts and generic errors. Deployment requires
  a separately authorized pinned SSH tunnel; do not expose this port publicly
  or reuse the provisioning tunnel token or checkout credential.
- Operator-only compare-and-swap activation/pause rotates a durable sender fence.
  New databases and service-store restarts are paused. Old fences cannot claim.
  Fence rotation does not cancel an already acknowledged or in-flight payment:
  stopping/draining all senders is still mandatory before restore/reconciliation.
- A first durable claim returns `created`; exact retries return `recorded` only.
  The latter is never renewed send permission. A lost acknowledgement therefore
  leaves an unresolved obligation requiring lookup, not another send. Outages,
  failed writes or malformed receipts cannot permit sending.
- Remote recovery requires explicitly verified deployment topology plus complete
  authenticated wallet history. It checks journal identity, allocation commitments,
  fence and high-water sequence before/after a bounded scan. Missing restored
  allocations, new journal entries during audit or uncertain proof stay blocked.
- The payout worker now awaits remote acknowledgement after its atomic local
  budget claim and before calling the injected sender. It rechecks policy expiry
  and recovery readiness after waiting. No real NWC sender has been enabled.

Before deploying: review the non-root package, provision private journal storage
on the other VPS with independently tested backups, establish restricted private
transport and separate credentials without displaying them, verify retention and
sender stopping, then rehearse restart/outage/restore on isolated staging data.
Loss or rollback of both stores still requires independent wallet history and
operator recovery. This implementation does not assert provider-level physical
independence or authorize a live payment test.

### Standalone package — local acceptance only

`npm run journal:package` produces `release-build/bitcoinwalk-remote-journal-0.1.0.tar.gz`
and its SHA-256 manifest. The archive contains the bundled Node service, this
operating guide and an intentionally unconfigured user-service template. It has
no tokens, wallet connection, database, installer or automatic activation.
`npm run journal:smoke` extracts and starts that exact archive as the current
non-root user with synthetic credentials and a temporary loopback port.

Runtime requires Node 24+ and one canonical absolute state-directory argument.
Provision that dedicated directory as the service user, mode 0700. It must contain
only regular, singly linked files owned by that user, mode 0600 (no symlinks):

- `config.json`: strict object with `binding` (the reviewed 64-character lowercase
  hexadecimal wallet-binding digest) and `port` (1024–65535).
- `client.token` and `operator.token`: distinct cryptographically random base64url
  tokens, 43–256 characters each. Generate and install privately; never put them
  in command arguments, Git, a browser or service logs. The operator credential
  must not be supplied to the payout worker.

Startup refuses root, loose permissions, symlinked paths, invalid credentials,
unexpected configuration or an existing `service.lock`. It never repairs
permissions. SQLite files are created under umask 0077; the listener is fixed to
127.0.0.1. New journals and every restart are paused. SIGTERM/SIGINT closes requests
and SQLite before removing the exclusive lock. A crash deliberately leaves the
lock: verify the service and all senders are stopped before removing only that
lock and restarting. Never remove journal records to get past an error.

The example systemd user unit has placeholder absolute runtime/release paths and
no automatic restart. Review paths and provision credentials before installing it;
it is not a deployment script. A backup must use SQLite's consistent backup
mechanism or a fully stopped database, not a raw copy of an active WAL database.
Restore requires stopped/drained senders, independent retained history and the
existing recovery checks; operator activation alone is not recovery evidence.

Local packaged acceptance passed: unauthorized requests and client-side operator
commands denied; concurrent instance rejected without pausing the owner; first
claim created, exact retry recorded; restart retained identity/records but paused
and invalidated the old fence; new-fence retry remained recorded; database mode
0600; loose token permissions rejected. No VPS, tunnel or wallet was accessed.
Independent backup/restore and restricted transport still require staging review.

## Deliberate boundaries / next slice

The ledger is an internal accounting primitive, not proof that a payment happened.
Its caller must authenticate and verify settlement with the bound receiving wallet;
it must never forward browser JSON or an unverified notification directly to settle.

Before runtime integration, implement and test:

1. Deploy neither harness nor sender yet. Review provider compatibility, outbound egress policy and response
   limits before real requests. Add reviewed IPv6/cross-origin support if needed.
2. A connection-bound collector and real wallet adapter, notification deduplication plus paged
   settlement catch-up, authenticated wallet lookup, fee/budget enforcement and
   unknown-send reconciliation. A missing lookup result is not a failed payment.
3. Reviewed definitive-failure recovery and expired unsent invoice replacement;
   never release an uncertain payment merely because its invoice has expired.
4. Production restore tooling, independently provisioned journal durability,
   enforceable sender fencing and an audited retention-coverage provider for the
   tested authenticated history collector. Never guess complete-history coverage.
5. Rustress adapter integration, one forwarding authority, capability gates,
   alerts, private operational views and explicit authorization for a bounded
   live test. Keep checkout's receive-only connection unchanged.

Tests cover duplicate settlement, immutable snapshots, large integer arithmetic,
fractional carry-forward, recipient limits, cross-city/wallet/version isolation,
atomic allocations, duplicate hash rollback, two SQLite handles claiming once,
restart while outcome is unknown, restart after payment, preimage validation,
fee conflicts and conservation of every allocated millisatoshi. They use only
synthetic records and temporary local databases, not real invoices or funds.

Verification: 1,070 tests across 188 files pass on Node 24, including 15 ledger
tests and 24 outgoing-invoice/worker tests. This slice adds 35 fixture tests for
recipient retrieval, pinned HTTPS transport and outgoing wallet lookup validation.
The authenticated reader adds 16 fixture tests for signatures, correlation,
checkout isolation, read-only methods, timeouts and integrated payout proof checks.
The integrated flow adds 18 tests for multiple payment amounts, duplicate credit,
forged settlement, minimum/maximum payouts, endpoint outage, immutable recipients,
budget sharing, authorization failures, missed notifications and restart recovery.
Restore coverage adds 15 independent-journal/older-backup tests plus an integrated
missing-guard denial test. These use only synthetic wallets and temporary files.
History/storage composition adds 27 tests covering pagination/coverage failures,
unpaid-inclusive encrypted requests, private storage checks and default denial.
Remote-journal coverage adds 15 tests for durable/idempotent claims, conflicts,
lost acknowledgements, database restart, fencing, denied deployment, restoration,
response bounds and actual authenticated loopback HTTP with operator isolation.
TypeScript, changed-file lint and
backlog checks pass. No staging/production
release is needed for this unconnected component.
