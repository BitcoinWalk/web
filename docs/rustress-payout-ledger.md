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

### Isolated VPS deployment and off-host restore — 8 October 2026

The user authorized the next isolated staging step. Installed as `bitcoinwalk`
(UID 1004, no sudo/root) on the Rustress VPS `.240`, separately from Rustress:

- Release/state root: `/home/bitcoinwalk/journal-staging-0.1.0`.
- User unit: `bitcoinwalk-journal-staging.service`, active but **not enabled at boot**.
- Listener: **127.0.0.1:8891 only**; no public proxy, DNS or firewall change.
- Private Node v24.19.0 Linux x64 runtime, archive verified against its official
  nodejs.org SHA-256 manifest. The host previously had no Node on PATH.
- Package SHA-256: `92c37b9eae90f5d1453dcadabad3aa8ee352f6fc043a03b4ae6584497e719249`.
- Dedicated fixture binding derived from `bitcoinwalk-isolated-journal-staging-no-wallet-v1`,
  new private client/operator tokens, directory 0700 and files 0600. No wallet
  binding, NWC connection or Rustress credential was read or reused.

`scripts/install-staging-journal.py` is a one-time, fixed-account installer that
refuses existing installation/unit paths. `scripts/rehearse-staging-journal.mjs`
only accepts the synthetic binding and uses fixed fixture directories. The backup
mode requires a new empty journal. Do not reuse these scripts for live state.

Actual VPS checks passed: authentication denial, first durable claim, recorded
retry, stopped-service outage, restart with unchanged service identity/record
and a paused new fence. A fully stopped SQLite backup was copied off-host to the
local private ignored release-build directory, then returned into a **separate**
restore directory. All three copies matched SHA-256
`5c48f32203e36290e1f70fbb7d5e807da0670652faffbe1fbbd0d8f911314f7c`.
The isolated restored process on 127.0.0.1:8892 retained the identity and record,
rejected the stale fence, and returned `recorded` after fixture-only activation:
no renewed send permission. It was paused and stopped after verification.

Final state: original service running **paused**, one synthetic claim retained,
restore process stopped, 8892 not listening, unauthenticated status HTTP 403.
Existing fixture service on 8890 remains present. No live payment or app rollout.
The generated backup contains only synthetic journal data and no credentials.

This proves a manual off-host fixture restore, **not** automated production backup
retention, encryption, monitoring, provider failure-domain guarantees or safe live
activation. Still required: separately restricted persistent private transport,
app-side deployment verification, independent managed backups, authenticated
complete wallet-history evidence and authorized wallet budgets/fee limits. No
sender is wired to this service; do not activate the fixture as a live journal.

### Dedicated cross-host staging transport — 8 October 2026

Installed non-root user service `bitcoinwalk-journal-tunnel.service` on app VPS
`.138`: 127.0.0.1:18891 forwards to journal VPS `.240` 127.0.0.1:8891. It is running
but not enabled at boot. Its dedicated key/configuration live under the private
`/home/bitcoinwalk/.config/bitcoinwalk-journal-tunnel` directory. The host key is
pinned to the previously trusted ED25519 key, never blindly accepted on first use.

The new key is authorized only from `.138`, with `restrict`, forwarding restricted
to the journal destination, remote listening confined to the journal port,
and forced `/bin/false` for session commands. Existing authorized keys were
preserved with a private pre-append backup. No shell, PTY, agent, X11 or user-rc
access is granted. Actual shell execution and forwarding to ports 8890 and 22
were denied. The existing Rustress connection was not reused or modified.

Only the fixture **client** credential and pinned service/binding were transferred
privately to the app host; the operator credential remains on the journal host.
`scripts/deploy-journal-tunnel.py` orchestrates one-time deployment and testing;
it captures secrets in memory without logging them. `scripts/test-journal-tunnel.ts`
bundles the real `RemoteJournalClient` into a standalone Node fixture harness.

Across the actual two hosts, the harness verified pinned identity, authentication,
operator denial with the client token, synthetic first claim, exact read-back,
recorded retry, conflicting-commitment rejection and loss of transport. Stopping
the tunnel caused the client to refuse an uncertain outcome; restarting it
restored access to the paused service. Fixture activation was temporary and
followed by an explicit pause on the journal host. No browser route, application
environment, NWC credential, wallet adapter or payment was enabled.

This is **cross-host journal protocol acceptance**, not a completed end-to-end
payout test or a live deployment-readiness grant. The retained claims are synthetic
and have no corresponding real ledger or wallet history. A fresh, separately
bound fixture will be needed for full worker/recovery acceptance with a fake wallet;
never remove these journal records or waive missing-history checks to make that
test pass. Production backup policy and wallet/history/fee approvals remain open.

### Complete fake-wallet flow acceptance — 8 October 2026

`scripts/payout-acceptance-fixture.ts` exercises the real PayoutFlow, PayoutWorker,
SQLite ledger, RemoteJournalRecovery, RemoteJournalClient and real loopback HTTP
journal together. Only wallet settlement/send/lookup, recipient invoice responses
and readiness evidence are synthetic. It reads no environment configuration,
credentials or existing database. Every scenario uses a fresh random binding,
temporary databases and ephemeral loopback port, closed and removed afterwards.
Its fixture readiness permit is not a deployed-wallet or topology approval.

Nine scenarios passed locally and as non-root `bitcoinwalk` on staging app VPS
`.138` using its installed Node runtime:

- Incoming 100, 250 and 12,345 sats: exactly one fake send despite duplicate
  collection/run; 79% credited to organizer, whole-satoshi payments with residual
  millisatoshi debt retained, fees deducted from BitcoinWalk's share only.
- Fake sender asserts the durable journal record exists before it is called;
  supplied fee cap remains exact.
- Wallet settlement followed by lost response and unavailable lookup: ledger
  reopens from disk; history/lookup recovery settles once without resending,
  even after original authorization expiry.
- Journal acknowledgement lost after commit: zero sends, retained claim, retry
  remains `recorded`, obligation remains unknown rather than released.
- Journal outage and stale sender fence: zero sends and recovery paused.
- Incomplete history or empty restored ledger: reconciliation stays blocked.

Build/run with `npm run payout:acceptance:build` then `npm run payout:acceptance`.
The same scenarios run in Vitest. All **1,079 tests across 189 files** pass; types,
changed-file lint and backlog checks pass. The credential-free harness was uploaded
to staging `incoming`; no app restart or configuration change was made. Existing
cross-host journal records were not touched.

These complete-flow scenarios used same-host temporary HTTP; preceding cross-host
protocol tests verified restricted transport separately. This is not a fully
deployed cross-host live payout workflow. Remaining: default-disabled real wallet
adapter/settlement collector, deployment and retained-history proof, managed
encrypted backups/monitoring, numeric budget/fee authorization and an explicitly
approved bounded live test. BW-18 remains In progress; no real spending enabled.

### Default-off NWC wallet and settlement collector — 8 October 2026

Implemented `RustressNwcWallet` with the shared authenticated NIP-44 NWC
transport, while preserving `RustressNwcReader` as a read-only wrapper with no
exposed generic RPC or send method. Existing read verification tests still pass.
The wallet adapter is constructible only from explicitly supplied private server
configuration; no environment loader, browser route, service or live connection
has been added. The receive-only checkout connection cannot be reused.

Send remains disabled by default and requires both an explicit enable callback
and a trusted per-payment permit. The permit binds the exact connection, invoice
hash, amount and enforced fee ceiling, is checked for freshness/expiry, and is
checked again after relay connection establishment before publication. It must
come from independently verified wallet enforcement, budget, deployment and user
authorization—not caller assertions or NWC capability advertising. **No such live
permit provider is implemented or configured yet.**

[NIP-47 pay_invoice](https://nips.nostr.com/47) has no standard per-payment fee-cap
parameter. The adapter therefore sends only the invoice and refuses a permit
whose verified wallet-enforced ceiling exceeds the ledger's approved cap. It
does not invent a `max_fee` parameter or infer enforcement from a successful pay.
The worker still needs exact authenticated lookup before recording settlement.
Publication errors, malformed replies and invalid preimages remain uncertain;
there is no automatic payment retry. An in-process bounded attempted-hash guard
supplements, but never replaces, the durable ledger/journal exclusion.

`SettlementCollector` is also off by default. It accepts bounded deduplicated hash
hints, rechecks saved invoice snapshots through authenticated lookup, and performs
bounded scans of registered pending invoices. Failed lookups remain pending for
later scans, completed scans reset their cursor, concurrent scans are blocked,
and disable checks stop subsequent work. It supplies no automatic timer, NIP-47
notification subscription or invoice-import endpoint. A future scheduler can poll
these saved invoices without relying on reliable notification delivery.

Nineteen new tests cover disabled state, request encryption/binding, no invented
fee field, one publication per attempted hash, invalid/expired fee permits,
disable/expiry during connection setup, uncertain publication, invalid preimages,
and collector bounds, duplicates, retries and concurrency. All **1,098 tests in
190 files**, type checking and changed-file lint pass. Only synthetic signed
responses were used; no live NWC credential was read and no wallet was contacted.
No VPS deployment or Hub permissions changed in this slice. Next: reviewed
default-off runtime composition and real provider/history readiness evidence;
budget/fee approval and bounded live acceptance remain separate gates.

### Default-off runtime composition and readiness review — 8 October 2026

`PayoutRuntime` now composes the reader, wallet, journal client, authenticated
history collector, recovery gate, payout flow and settlement collector. Nothing
starts on import; there is no timer, environment activation, public endpoint or
automatic journal activation. Disabled startup does not even load credentials.
The runtime receives explicit private providers and an existing ledger rather
than silently discovering wallet settings.

Startup requires exact wallet/journal-bound deployment evidence, current wallet
readiness, then complete authenticated history and successful journal recovery.
Deployment evidence expires within the runtime's 60-second freshness window.
It now also performs an authenticated `get_info` call through the exact payout
connection and requires the strict reviewed Hub/LDK payment-safety capability
before constructing the sender or starting recovery. Generic NIP-47 methods,
inventory labels and operator assertions do not satisfy this gate; stock Hub,
wrong backend/revision and incomplete capability statements fail closed.
Operations serialize, pause invalidates pending startup and wallet permission,
and the adapter rechecks its enable callback before publishing. A payment already
published cannot be recalled by pause: stop/drain and reconciliation remain
mandatory. Ten composition tests cover default-off credential isolation, verified
settlement collection, missing/wrong/expired deployment evidence, journal refusal,
expiry, concurrent startup, pause and disable during asynchronous checks.

Read-only staging recheck: dedicated tunnel active (not enabled at boot); pinned
synthetic journal reachable, paused, refusing claims and client-side operator
commands. No wallet was queried and no application/Hub deployment changed.

Readiness is **not granted**. Outstanding evidence and authority:

| Gate | Current evidence | Still required |
|---|---|---|
| Private journal transport | Cross-host fixture checks and fresh paused read-back pass | Live-bound deployment provider; synthetic journal must not become a live journal |
| Backup/recovery | Authenticated encrypted synthetic ledger, independent-journal and exact candidate-workdir restore/rollback passed | Provision managed encrypted retention, key custody and monitoring for live state; rehearse actual stopped/fenced host procedure before activation |
| External NWC relay | One synthetic signed/encrypted request and correlated response passed through Hub's reviewed default relay and patched handler, with mock LN only | Install no-spend candidate in staging under a reviewed rollback plan; do not infer wallet readiness from relay delivery |
| Wallet grants and fees | Earlier pinned Hub source audit; synthetic adapter tests | Fresh authenticated connection inventory and provider proving actual enforced fees/budget; not a callback returning guessed values |
| Complete history | Bounded collector and refusal tests | Independent retained-history/exclusive-sender proof provider |
| Spending authorization | User approved 50,000 sats maximum payout, 100 sats maximum fee per payout, 200,000 sats total non-renewing budget including fees | Wallet enforcement and remaining readiness gates; limits alone do not authorize activation |

Asked the user for pilot limits without requesting activation. No real credentials
were loaded. BW-18 remains In progress. Authenticated synthetic backup/restore/
rollback subsequently passed for the app ledger, independent journal and exact
five-patch Hub candidate; managed live-host retention remains operational work.
The external real-relay candidate gate subsequently passed with synthetic keys,
temporary state and mock LN only. The next step is a reviewed, reversible,
non-spending staging installation and fresh operational evidence—not flipping a
production or payout flag.

### Approved pilot limits — 8 October 2026

Explicit user approval replaces the earlier proposed pilot numbers:

| Limit | Sats | Integer msat value |
|---|---:|---:|
| Maximum single organizer payout | 50,000 | 50,000,000 |
| Maximum routing fee per payout | 100 | 100,000 |
| Total non-renewing budget, principal plus fees | 200,000 | 200,000,000 |

The budget is shared across the pilot wallet, not renewed per city or payment.
Unknown attempts retain their principal and fee reservation. The organizer keeps
the full 79% allocation; BitcoinWalk covers routing fees. These are pilot ceilings,
not target payment sizes, invoice amounts or changes to the 79/21 allocation.
No reset schedule or automatic budget replenishment is approved.

### Production Hub and fee-policy revision — 9 October 2026

The user explicitly chose the existing production Alby Hub rather than a
separate Rustress Hub and accepted the installed Hub's native LDK routing-fee
policy. This supersedes the earlier 50,000-sat payout, 100-sat fee and
200,000-sat total pilot ceilings for the production Rustress connection.

The separate isolated NWC app has a non-renewing **797,900-sat** spending
allowance. Incoming invoices are not capped by that allowance. For a maximum
**1,000,000-sat incoming payment**, the organizer principal is **790,000 sats**;
the installed Hub may use up to **7,900 sats** of routing fee under its 1%
ceiling, paid by BitcoinWalk. At that worst case BitcoinWalk retains at least
202,100 sats. The existing receive-only checkout connection is unchanged.

The app was created with `pay_invoice`, `get_balance`, `get_info`,
`make_invoice`, `lookup_invoice`, `list_transactions` and notifications, with
isolated accounting and without `sign_message`. Its secret was not revealed to
the agent, chat, logs, shell history or command arguments. The user installed it
through a masked controlling-terminal prompt into the non-root Rustress host's
owner-only mode-0600 storage; a redacted verifier passed. A rootless, default-off
wallet shadow now consumes it read-only; invoice creation and payouts remain
disabled in that service. Connection-bound probes and the separately authorized
funded acceptance below were run as one-shot tools, not through a public API.

A subsequent live, read-only probe ran as the non-root Rustress service user
against that exact protected connection. Authenticated `get_info` reported
bitcoin mainnet and advertised `get_info`, `make_invoice`, `lookup_invoice`,
`list_transactions` and `pay_invoice`; bounded transaction-history reading also
passed. The output contained no wallet identifiers, relays, balances,
transactions or credential material. No invoice was created and no payment was
sent. The checksum-verified temporary runtime was removed. This closes only the
connection-bound info/history read slice; inventory, known-invoice lookup,
notification, reconciliation and funded-payment gates remained at that checkpoint.

### Funded incoming-notification acceptance — 9 October 2026

With explicit approval for an exact **100-sat incoming payment**, a one-shot
rootless acceptance tool subscribed to the connection-bound notification stream
before creating the invoice. The user paid from a separate wallet. The protected
production Hub connection delivered a valid `payment_received` notification as
legacy NIP-47 kind 23196. Its payment hash matched the created invoice; exact
lookup returned that same invoice as settled; and SHA-256 of both returned
preimages matched the payment hash. The tool has no public send method and the
result confirms `outgoingPaymentSentByRustress=false`.

The package ran under non-root `bitcoinwalk` in a digest-pinned rootless Docker
container with a read-only root filesystem, dropped capabilities, bounded
resources and read-only credential mount. The invoice handoff used a private
mode-0600 file and was removed after the run. No NWC secret, wallet identifier,
relay, balance, invoice or preimage entered the repository or logs.

This proves real incoming notification delivery and exact settlement read-back;
it does **not** prove the 79% forwarding payment, routing-fee accounting,
uncertain-send recovery, retained-history coverage or automatic Rustress
activation. Spending remains disabled until those independent gates pass.

### Bounded live organizer payout acceptance — 9 October 2026

After the funded incoming checkpoint, the user separately confirmed an exact
**79-sat** payment from BitcoinWalk Hub to Madeira's saved organizer destination,
`liberatelife@getalby.com`, with up to **10 sats** of routing fee. Preparation
validated the public LNURL-pay metadata, same-origin callback, exact signed
BOLT11 amount, metadata commitment, mainnet network, payment hash and expiry.
No payment was made during preparation.

The constrained send process synced a durable exact-hash claim before publishing
the wallet request. Wallet-signed lookup then verified the exact outgoing amount,
preimage and an actual **1.786-sat** routing fee. A fresh process mounted the
retained invoice and claim read-only, found the same paid transaction and reported
`sendAttempted=false` and `recoveryNoResend=true`. The organizer independently
confirmed receiving 79 sats. This moved 79 sats plus the 1.786-sat fee from the
production BitcoinWalk Hub under the user's explicit authorization.

Preparation also exposed a fail-closed bug for dual-stack recipients: the
IPv4-only adapter rejected a domain merely because DNS also returned public IPv6.
It now filters to IPv4, requires at least one validated public IPv4, rejects the
entire set if any selected-family address is private/reserved, and connects only
to the pinned validated IPv4. Tests retain IPv6-only and mixed public/private IPv4
denials.

This is one bounded live acceptance, not runtime activation. The temporary tool
is not a daemon or public endpoint. Automatic Rustress settlement ingestion,
production ledger/remote-journal composition, complete retained-history and
backup reconciliation, monitoring/alerts, uncertain network-failure drills and
a controlled activation/rollback window remain required.

**Historical superseded pilot gate:** the audited Hub v1.24.0 LDK backend's
`max(ceil(amount_msat * 0.01), 10000)` fee ceiling would permit 500 sats on a
50,000-sat payout, exceeding the approved 100 sats. The existing guard must refuse
such a payout until an actual wallet-side ceiling no higher than 100 sats is
verified. Under the audited formula, amounts above 10,000 sats fail that fee
gate. The production decision above supersedes those earlier numeric ceilings;
this paragraph is retained as the audit history, not the current policy.

No live policy/credentials were installed and no wallet permissions, payments or
services changed when recording this approval. A concrete activation/expiry
window and remaining deployment, history and backup evidence are still required.

An explicitly authorized local no-funds Hub candidate now has reproducible
mock/offline test executables and a fee-reservation/budget regression patch.
This does not change the installed wallet or adapter capability: live spending
remains disabled. See the isolated candidate evidence in
[wallet readiness](rustress-wallet-readiness.md#isolated-candidate-build--8-october-2026).

The follow-on native server package is now reproducible from the clean pinned
Hub source with all five reviewed patches. The full frontend build and Go suite
pass before packaging. The archive contains the server, migration binary,
matching LDK library, hashed manifest and non-root stage/rollback scripts, but no
wallet data, credentials or enabled service. Its disabled launcher exits by
design; checksum verification, isolated staging, rollback, unsafe-link rejection
and non-empty-state refusal pass. The ignored local archive hash is recorded in
[wallet readiness](rustress-wallet-readiness.md#default-disabled-native-server-package--8-october-2026).
No VPS or wallet changed. BW-18 remains In progress: non-spending host install,
real connection-bound wallet/history evidence, managed retention and a later
explicitly authorized funded acceptance are still separate gates.

The user then selected Docker. The exact package is now built and staged on
`.240` in a separate rootless Docker namespace owned by non-root `bitcoinwalk`.
The digest-pinned context bundle, image ID and runtime policy are recorded in
[wallet readiness](rustress-wallet-readiness.md#rootless-docker-staging--9-october-2026).
The candidate first passed its stopped `created`-state gate: the disabled entry
returned 78 and rollback/rematerialization preserved the same image and empty
state. The user then separately authorized its no-spend start. The exact image is
now running rootlessly with a read-only root, no restart policy and loopback-only
`127.0.0.1:18080`. Its public home and info endpoints return HTTP 200, while Hub
reports `setupCompleted=false`, `running=false` and `unlocked=false`. Fresh state
contains only the safety marker, an unconfigured SQLite database/WAL and logs;
there is no recovery file. No setup, restore, unlock or wallet operation was
called, and existing Hub/Rustress health is unchanged. This closes the isolated
no-spend HTTP runtime checkpoint; live-bound wallet/history evidence, managed
retention and funded acceptance remain open.

The first managed-retention slice is now scheduled without a wallet. `.240`
encrypts stopped-container snapshots locally and can upload only through a
shell-denied transport key to an append-only `.138` receiver. Receiver pruning
retains 48 hours plus 14 daily, 8 weekly and 12 monthly points. A disposable-key
rehearsal passed checksum/receipt/restart acceptance, then all synthetic key and
archive artifacts were removed. Public recipient `A206…B188` contains no secret
key; the first retained real ciphertext then passed its receiver checksum and
the six-hour sender timer was enabled. Confirmed independent private-key custody,
and an independent human-run decrypt/restore rehearsal now pass: path/type and
required-file checks, SQLite integrity and automatic cleanup returned
`RESTORE_REHEARSAL_OK`, with no temporary restored state left behind. External
failure alerts and post-initialization wallet-history reconciliation remain open. See
[the runbook](hub-candidate-backups.md).

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
4. Provision the tested encrypted-backup policy on managed live storage, including
   independent key custody, retention/monitoring, journal durability, enforceable
   sender fencing and an audited retention-coverage provider. Never guess
   complete-history coverage or replace a SQLite file under an open connection.
5. Rustress adapter integration, one forwarding authority, capability gates,
   alerts, private operational views and explicit authorization for a bounded
   live test. Keep checkout's receive-only connection unchanged.

Tests cover duplicate settlement, immutable snapshots, large integer arithmetic,
fractional carry-forward, recipient limits, cross-city/wallet/version isolation,
atomic allocations, duplicate hash rollback, two SQLite handles claiming once,
restart while outcome is unknown, restart after payment, preimage validation,
fee conflicts and conservation of every allocated millisatoshi. They use only
synthetic records and temporary local databases, not real invoices or funds.

Verification: 1,108 tests across 191 files pass on Node 24, including 15 ledger
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
