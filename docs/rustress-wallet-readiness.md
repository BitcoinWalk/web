# BW-100 — wallet permission preflight

8 October 2026. Implemented and tested locally; no wallet connection, permission,
funding, invoice or deployment changes. Madeira's isolated fixture remains intact.

`src/rustress/wallet-readiness.ts` is a pure, private evidence evaluator, not a
wallet client or activation endpoint. It is not wired into runtime provisioning.
It returns either `blocked` or `ready-for-authorized-test`, and **always** returns
`livePaymentsEnabled: false`. Passing it neither authorizes spending nor proves
that notifications, fees, outgoing settlement or recovery work end to end.

## Required evidence

The eventual trusted server-side collector must bind all records to one exact
connection and obtain policy from an explicitly approved server-side record.
Do not accept this evidence from browser JSON or a wallet's self-description.

- Separate opaque references for Rustress and the existing receive-only checkout
  connection. Never add pay_invoice to checkout.
- Authenticated Hub app inventory: granted get_info, make_invoice, lookup_invoice,
  list_transactions and pay_invoice; notification permission; revocation status;
  exact spending budget and remaining allowance; renewal and isolation state.
- The wallet's advertised methods, checked separately from actual app grants.
- Successful read-only get_info, lookup_invoice and list_transactions probes on
  that same connection. Inventory/advertising alone does not establish these.
- Explicit approved network, maximum pilot budget, maximum test payment and
  routing fee, expiry and evidence that the selected send path enforces the fee
  cap. BitcoinWalk-paid routing fees were approved on 8 October; there is no
  assumed user budget, numeric fee-cap approval or live-payment authorization.
- Prefer a separate-balance wallet. Shared node balance requires explicit review.
  An isolated balance is not a substitute for a spending cap, and shared apps'
  reported zero app balance must not be mistaken for an empty node wallet.

Inventory and protocol observations expire after 15 minutes. Expired/revoked or
future-dated evidence fails closed. The first pilot requires a non-renewing
budget, enough remaining allowance for the approved test plus fees, and rejects
unnecessary broad methods such as sign_message. Credentials, NWC identifiers,
private relay URLs and raw provider errors are excluded from the input/output
contract. Reject extra fields; expose only fixed issue codes.

## Next safe operational steps

1. Obtain the user's Hub dashboard URL and establish protected, least-privilege
   read access. Never enter credentials over public plain HTTP or print secrets.
2. Read the authenticated connection inventory with redacted output. Verify the
   actual installed Hub/backend version and which controls it supports. Do not
   infer the wallet behind bitcoinwalk@getalby.com from its address alone.
3. Agree the separate connection, isolation, non-renewing budget, expiry and fee
   policy with the user. Creation/funding is a separate authorized operation;
   the current private Rustress fixture must never receive wallet credentials.
4. Add and test a read-only collector using the agreed connection. Prove the
   permission evidence is connection-bound and handle redaction and revocation.
5. Complete durable BW-18 obligations/reconciliation, BW-19 endpoint gating,
   backups and security review before a separately authorized bounded payment.
   A metadata preflight is not sufficient to activate public city addresses.

The Alby Hub skill's app/sub-wallet guidance informed connection separation,
scoped permissions, non-renewing pilot budget and isolated-vs-shared balance
handling. No Hub management command or NWC request was executed.

Tests cover invalid/secret-bearing input, advertised-vs-granted permissions,
checkout reuse, staleness, revocation, wrong network, excess scopes, incomplete
read probes, missing notifications, budget limits/renewal/fees, wallet isolation
and unsafe integer amounts. No live tests are claimed.

Access checkpoint: the user supplied `https://hub.bitcoinwalk.org/` and logged
in directly over HTTPS. No saved local Hub CLI token exists (existence checked
only). Authenticated UI inspection on 8 October shows one connected app, Paid
city. Its granted permissions are read balance, read node information, create
invoices, look up invoices, read transaction history and receive notifications;
it has no sending permission and no connection expiry. No Rustress-specific
connection is listed. Preserve checkout's existing permissions unchanged.

This is authenticated UI inventory, not completed protocol-probe evidence. No
NWC secret was revealed/read, no connection created and no permission, budget or
wallet setting changed. The update banner is not an authoritative installed
version check. Backend/network, fee enforcement, budget policy, backups and
the connection-bound read-only collector remain unverified. Complete durable
BW-18 accounting/uncertain-send recovery before granting a separate spending
connection, then request explicit approval for scope, budget and expiry.

## Installed-version fee and budget review — 8 October

A subsequent read-only visit to Settings/About explicitly confirms **v1.24.0,
LDK, SQLite** (not inferred from the update banner). Paid city remains receive-only.
No backup page, secret, wallet credential, permission or payment was accessed/changed.

Later explicit pilot-limit approval, 8 October: maximum payout **50,000 sats**,
maximum fee **100 sats per payout**, and **200,000 sats total non-renewing budget
including fees**. This is not activation approval. The source-audited LDK ceiling
below is 500 sats at the approved maximum payout, so the adapter must block that
amount until the 100-sat ceiling can actually be enforced. No wallet setting has
been changed. See `rustress-payout-ledger.md` for exact units and remaining gates.

Production decision, 9 October: the user superseded those pilot ceilings for
the production Rustress connection, selected the existing production Hub and
accepted its native routing-fee ceiling. A distinct isolated **BitcoinWalk
Rustress** NWC app was created with receive/reconciliation/send scopes, no
message-signing scope and a 797,900-sat non-renewing spend allowance. This
supports a 790,000-sat organizer payout after a maximum 1,000,000-sat receipt,
plus the Hub's possible 7,900-sat fee. The receive-only **Paid city** app remains
unchanged. The secret was installed through a masked TTY prompt into non-root,
owner-only mode-0600 storage on the Rustress host without entering chat, logs,
argv or shell history. A redacted readiness check passed. No service consumes
the credential yet, the isolated balance has not been funded, and live payments
remain disabled pending connection-bound acceptance.

The first live connection-bound read checkpoint then passed from the non-root
Rustress host. Authenticated NWC `get_info` identified bitcoin mainnet and
advertised the required invoice, lookup, history and payment methods; a bounded
`list_transactions` call returned the expected response shape. Output was
redacted to method names, network and success booleans. No invoice or payment
was created, and the temporary checksum-verified probe runtime was removed.
Authenticated Hub app inventory, a successful lookup of a known BitcoinWalk
invoice, notifications, service consumption and funded acceptance remain open.

### Fee-cap implementation investigation — 8 October 2026

Read-only upstream check identified [Hub PR #2566](https://github.com/getAlby/hub/pull/2566),
linked from [issue #2557](https://github.com/getAlby/hub/issues/2557), and the open
[NIP-47 proposal #2444](https://github.com/nostr-protocol/nips/pull/2444).
GitHub API confirmed #2566 is open and unmerged at head
`a231ed34a660cd86c0bd7f36282f7eb0dc90223f`. This is a candidate, not verified
released or installed capability. A search snippet misidentified another NIP PR;
only the directly inspected proposal above is evidence.

Inspected actual diff: the NWC controller accepts `max_fee` in millisats, the
transaction service forwards it, and LDK overrides `MaxTotalRoutingFeeMsat` with
that value. However, the transaction-service diff leaves the existing fee-reserve
calculation unchanged. A requested cap greater than the default reserve therefore
needs budget-accounting review; a tighter cap may over-reserve. For this pilot,
100 sats is below the default 500-sat reserve at a 50,000-sat payout. This does
not justify treating the whole branch as safe, nor proving installed support.

The user subsequently authorized an isolated, no-funds candidate build and tests
(evidence below), not a live upgrade. Before
any live adoption, review budget reservation/recovery, reject unsupported backends,
prove requested cap reaches LDK on initial and recovery paths, test boundaries and
no-route outcomes, bind capability to the exact installed revision, and plan Hub
backup/rollback. Do not silently send an unknown `max_fee` field to the current
Hub, install a custom build, switch wallet backend or relax the approved limits.
No Hub, application or wallet changes were made during this investigation.

### Isolated candidate build — 8 October 2026

Completed locally, without a running Hub, wallet credentials, VPS changes or
payments. `integrations/alby-fee-cap/isolated-candidate.patch` applies only to
upstream `a231ed34a660cd86c0bd7f36282f7eb0dc90223f`, not the installed v1.24.0.

Regression tests first failed on the unchanged candidate: pending reservations
ignored the requested cap; a cap above the default could exceed the app budget;
an overflowing amount-plus-fee was accepted. The local patch reserves the exact
requested fee, checks signed-accounting bounds, and compares budgets in integer
millisats rather than rounded-down sats. Nil caps retain the default policy.

Verification on a fresh pinned checkout:

- Full transaction and NWC controller suites pass.
- 50,000-sat principal with a 100-sat cap reaches the mock backend unchanged;
  pending reservations survive service reconstruction and block duplicate sends.
- Exact 200,000-sat budget boundary succeeds; one millisatoshi over fails before
  backend invocation. Zero, below-default and above-default caps are covered.
- LDK helper test preserves explicit caps and defaults. The native package
  compiles, but no node or real route was exercised.

Reproduce as a non-root user with a fresh clean checkout at the pin:
`python3 integrations/alby-fee-cap/build-isolated.py /path/to/fresh-hub-checkout --go /path/to/go`.
Go selects the candidate's required toolchain (1.26.2); dependency downloads may
require network access. The script applies the patch, forces the mock tests to
local SQLite, runs the tests and builds three **test executables**, not a Hub
server. Logs, executables and SHA-256 manifest are under ignored
`release-build/alby-fee-cap-isolated/`. The manifest explicitly marks
`productionReady: false`. No upstream patch has been published.

At this checkpoint, still required: controlled regtest/signet route rejection at
the requested cap (subsequently covered below), no-route and uncertain/restart
outcome tests, review of concurrent budget use and
all supported backend semantics, installed-capability binding in the BitcoinWalk
adapter, and backup/rollback review. Offline tests do not prove live fee
enforcement. BW-18 remains In progress; spending remains disabled.

### Private routed-fee acceptance — 8 October 2026

User authorized the controlled test-network step. Followed the Alby Hub skill's
test-network isolation safeguards: no saved token, real wallet, live configuration
or public peer used. Docker access was unavailable; ran a temporary non-root
Bitcoin Core process and three native LDK nodes instead. Bitcoin Core 29.3 came
from the [official release directory](https://bitcoincore.org/bin/bitcoin-core-29.3/)
and its archive matched the published SHA256SUMS (not a claim of PGP verification).
RPC/P2P listeners were loopback-only, Bitcoin peer discovery/connections disabled,
and the chain was explicitly checked as regtest before mining fixture coins.

Three independently initialized runs passed:

- A 50,000-sat payment through a 101-sat route is rejected under a 100-sat cap.
- Positive control: the same route succeeds with a **test-only** 101-sat cap,
  reporting exactly 101 sats fee. This does not change the approved pilot policy.
- A 100-sat route is rejected when the cap is one millisatoshi below 100 sats.
- A 50,000-sat payment succeeds at exactly 100 sats fee.
- Destroying/rebuilding the sender from its temporary storage retains the settled
  amount and fee; attempting that exact invoice again returns DuplicatePayment.

Initial fixture debugging found that ordinary private channels did not forward
the control payment. Routing-enabled announced channels fixed the fixture; their
announcements were confined to the local regtest peers. Negative-only runs were
not counted as evidence. A subsequent repeat exposed stale sender routing-graph
fees immediately after a fee update. The fixture now explicitly waits for the
correct enabled B-to-C fee in the sender's graph as well as the recipient's
channel information before testing either cap. All temporary nodes stopped
after testing.

Reproduce after `build-isolated.py` with
`python3 integrations/alby-fee-cap/run-regtest.py /path/to/patched-hub-checkout --bitcoind /path/to/verified/bitcoind --go /path/to/go`.
The runner checks the upstream pin and applied patch, installs the opt-in test,
runs it three times, and records code/binary/log hashes under ignored
`release-build/alby-fee-cap-regtest/`. Without explicit `BW_REGTEST_BITCOIND`, the
test skips. Never substitute a production data directory or wallet.

**Scope:** real native LDK routing using the patched candidate's fee helper,
not an end-to-end NWC request through the complete Hub service. The earlier
controller/transaction mocks and this route test are separate layers. This proves
neither crash-during-payment reconciliation nor concurrent Hub budget enforcement.
Those checks, installed-capability binding, full backend review, encrypted backups
and rollback rehearsal remain open. No Hub deployment, permissions or spending
were enabled; BW-18 stays In progress.

### Controller recovery acceptance — 8 October 2026

**Deployment blocker reproduced; no wallet implementation changed.** The new
`bitcoinwalk_recovery_test.go` runs the actual NWC pay controller and Hub
transaction service against temporary SQLite, with an injected backend. This
tests the service/database boundary, not encrypted relay transport or a real
LDK payment interrupted in flight. The separate regtest route evidence remains
valid, but does not override a recovery failure.

Three repeats under Go's race detector produced the following results; no data
race was reported. The suite correctly exits nonzero because the unknown-outcome
safety assertions fail on every repeat.

- Concurrent admission: 20 distinct, simultaneous 50,000-sat requests with
  100-sat caps; three enter the backend, 17 receive quota errors. Both pending
  and settled usage are exactly 150,300 sats within the non-renewing 200,000-sat
  budget. This is one Hub process using SQLite, not multi-process/PostgreSQL proof.
- Abrupt process loss: a child exits after its pending reservation is committed
  and the injected backend is entered. The parent reconstructs the controller
  using that database, retains 50,100 sats usage, and blocks a second backend
  call. This models a lost process, not a proven real-wallet settlement outcome.
- Lost success response: discarding the response after settlement then retrying
  through a fresh controller does not invoke the backend again. Settled budget
  usage remains exactly 50,100 sats.
- **FAIL:** an entered backend returning `context.Canceled` or
  `context.DeadlineExceeded` is classified as FAILED. The 100-sat fee reservation
  becomes zero and the entire 50,100-sat obligation drops out of budget usage.
  A fresh controller permits the same invoice to reach the backend again before
  reconciliation. The test deliberately expects safe PENDING/reserved behaviour
  and remains red; do not weaken it to bless current behaviour.

Source path confirms this is relevant to the candidate: LDK's synchronous send
returns its context error when interrupted while waiting for a terminal event;
the transaction service unconditionally calls `markPaymentFailed` for a send
error. That clears the fee reserve, and budget queries exclude failed rows.
Lookup reconciliation only visits PENDING rows. This does not prove a duplicate
real payment occurred; it proves early reservation release and unsafe retry
admission at the controller/backend boundary.

Reproduce on the patched pin with
`python3 integrations/alby-fee-cap/run-recovery.py /path/to/patched-hub-checkout --go /path/to/go --race`.
The runner repeats tests three times, writes synthetic fixture logs
and a hash manifest under ignored `release-build/alby-fee-cap-recovery/`, and
returns nonzero with `status: blocked` on any failed assertion. The additional
lost-response test discards a success response then retries through a fresh
controller, checking that a settled invoice cannot be sent twice. No wallet
credentials, real keys, relay messages or production database are used.

Recommended next implementation, separately reviewed before adoption:

1. Distinguish proven terminal failure from unknown outcome. Preserve principal
   and fee reservation on cancellation, timeout, disconnect or ambiguous errors;
   do not merely special-case two Go errors and assume all others are definitive.
2. Persist the payment hash, app ownership and attempted fee bound; fence retries
   while unknown. Reconcile against the exact backend before releasing anything.
3. Make LDK restart reconciliation work even for notification-capable backends;
   check failed legacy rows that may have been misclassified without blindly
   refunding budgets or sending again. Missing lookup evidence is not failure.
4. Rerun these assertions, add late-success/definitive-failure and interrupted
   native-LDK scenarios, and review all backend error semantics before rollout.

The BitcoinWalk sender remains disabled. This candidate must not replace the
live Hub until this gate and the previously recorded rollout gates pass.

### Unknown-outcome correction accepted in isolation — 8 October 2026

The blocker above is now corrected in the local candidate, not in the live Hub.
The second reproducible patch, `integrations/alby-fee-cap/unknown-outcome.patch`,
applies after the pinned fee-cap patch and makes these scoped changes:

- An explicit unknown-outcome error preserves the pending row, principal and
  exact requested fee reserve. Context cancellation and deadline expiry are
  treated as unknown even if a backend fails to wrap them.
- LDK wraps shutdown while waiting for its terminal event as unknown. Its
  explicit `EventPaymentFailed` path remains a definitive failure, while an
  immediate error before a payment ID retains existing behaviour.
- LDK alone opts into authoritative outgoing lookup reconciliation. The earlier
  notification shortcut remains unchanged for other backends, avoiding the
  cross-backend behaviour change caught by the full transaction suite.
- Exact lookup settlement changes PENDING to SETTLED, replaces the reserve with
  the actual fee and keeps the same 50,100-sat total budget use. Until lookup
  proves settlement, retries remain fenced and missing evidence releases nothing.

Acceptance from a fresh pinned checkout:

- Complete transaction and NWC controller suites pass.
- All backend Go packages that do not depend on the separately generated
  frontend bundle pass serially. A parallel attempt was invalid because upstream
  packages share `test.db`; the serial run avoids that fixture collision.
- Recovery acceptance passes three repeats under Go's race detector: 20-way
  budget concurrency, cancellation, deadline, typed disconnect, exact lookup
  settlement, lost success response and abrupt child-process exit. No race was
  reported.
- Private three-node regtest passes three repeats: above-cap and one-msat boundary
  rejection, exact 100-sat success, reconstruction and duplicate rejection.

This closes the reproduced reservation-release defect for the tested LDK path.
It does not authorize deployment. The encrypted request boundary and terminal
failure handling are tested separately below. Live spending remains disabled.

### Encrypted NWC boundary and terminal failure accepted in isolation — 8 October 2026

`integrations/alby-fee-cap/run-nwc-transport.py` injects a synthetic, signed
NIP-44 `pay_invoice` event through the complete Hub event handler, permission
check, pay controller, transaction database and response publisher. The response
is signature-checked, correlated to the exact request and decrypted with the
request cipher. The backend receives exactly `100000` millisatoshis as the
maximum fee. A second case injects a proven terminal routing failure and checks
that the encrypted NWC error is returned, the row becomes FAILED, the fee reserve
is cleared and the non-renewing budget is released. Both cases passed three
repeats under Go's race detector; the surrounding NIP-47, controller and
transaction suites also pass serially.

This closes the local encrypted NWC application boundary and definitive-failure
release gates. It does not claim WebSocket relay delivery or a live wallet test:
the test uses an in-memory publisher and synthetic backend, with no credentials,
network or funds. Still open before deployment:

1. Rehearse encrypted backup, restore and rollback before any staging adoption,
   including the legacy-failure audit against a restored database copy.
2. Include real relay delivery and bounded no-funds staging acceptance in the
   final rollout rehearsal. Live spending remains disabled.

The functional build gate itself passes: the real HTTP frontend bundle and Linux
server binary were built from the patched pin, and the full serial `go test
./...` suite passed with that bundle embedded. The temporary server binary hash
was `754795a3fd9da902be8fcbf8df141038520f7586abe4471fc25d0f45a1285782`.
The first build exposed an upstream reproducibility defect: `vite` used the
floating `^8.2.1` range while the committed lock recorded 8.2.1, so frozen
installation failed and a non-frozen install silently selected 8.3.4. The
`frontend-lock.patch` candidate pins the already reviewed 8.2.1 release.
A fresh frozen install then left `yarn.lock` byte-identical, built with Vite
8.2.1 and passed the full suite. This is reproducible build evidence, not
deployment authorization.

The native interruption gate itself now passes three private regtest repeats:
the recipient is stopped before send, the sender is stopped during the in-flight
payment, both are rebuilt from the same LDK stores, the payment record remains
pending, and a duplicate submission is fenced. This proves LDK persistence and
reconstruction. The complete Hub composition now passes the same lifecycle
exercise: the payment is held at the receiver, the Hub child is killed, the
service restarts from the same database/LDK stores, exact lookup reconciles the
reservation without resending, and a duplicate retry is rejected while the
single outgoing row remains within the 50,000,000-msat payout and
200,000,000-msat total-budget limits.

### Legacy failed-payment quarantine accepted in isolation — 8 October 2026

`integrations/alby-fee-cap/legacy-failed-audit.patch` adds an explicit,
app-scoped audit and quarantine for outgoing rows created before the
unknown-outcome correction. It does not trust legacy failure text as proof that
the wallet never sent. The caller must select one exact app, an immutable time
cutoff, the approved 100,000-msat fee reserve and the SHA-256 fingerprint from a
fresh dry-run. Changed, empty, malformed, self-payment or hold rows stop the
operation.

An accepted batch is recorded atomically with each row's original state,
failure reason and reserve before the row returns to PENDING with principal plus
the exact fee cap reserved. This fences retries until authoritative lookup proves
settlement. Missing lookup evidence releases nothing. Repeating the same
fingerprinted operation after a lost response is a verified no-op. Other apps
and rows newer than the cutoff remain unchanged.

From a fresh pinned checkout, the audit, drift rejection, malformed-row block,
atomic apply, preserved evidence, budget accounting, cross-app isolation and
idempotent retry tests pass three times under Go's race detector. The complete
transaction and NWC controller suites also pass. No real database, wallet,
credentials, relay or funds were used. Before deployment, run the dry audit and
apply rehearsal only against an encrypted restored database copy; the live Hub
remains unchanged.

### Exact Hub capability binding accepted in isolation — 8 October 2026

`integrations/alby-fee-cap/capability-binding.patch` gives the reviewed LDK
candidate one immutable payment-safety identity,
`6bb8520025d781f8570ef1a5d134fe545a1586f3ab46cfedd780e15a641cfa84`.
Its signed NIP-47 `get_info` response attests the exact upstream commit, LDK
backend, explicit fee-ceiling enforcement, unknown-outcome reservation,
authoritative outgoing lookup and legacy-failure quarantine. Stock Hub and other
backends omit the statement rather than claiming partial support.

The BitcoinWalk payout runtime now calls `get_info` through the same private NWC
connection it will use for payouts, after the existing inventory/deployment
checks but before constructing the sending wallet or starting recovery. NIP-44
signature, author and request correlation in the transport authenticate that
response. The runtime accepts only the exact strict capability object; a missing
field, different candidate/upstream/backend, false safety flag or unreviewed
extra claim blocks readiness and no send is possible.

The reproducible capability runner applies the five independently reviewable
patches to the pinned source, passes the Hub statement/controller tests three
times under Go's race detector, and passes the app capability, payout-runtime
and authenticated transport suites. The complete Rustress suite also passes:
257 tests. No live Hub, wallet, connection secret, relay or funds were used.
Production remains disabled until bounded staging relay acceptance is complete.

### Authenticated backup, restore and rollback accepted in isolation — 8 October 2026

`integrations/alby-fee-cap/run-backup-restore.py` now exercises the exact
five-patch candidate three times under Go's race detector. It closes a synthetic
Hub database, archives its complete temporary workdir, authenticates and encrypts
the archive with AES-256-GCM, restores it elsewhere, runs the exact legacy FAILED
payment audit/quarantine, backs up and restores the migrated state, repeats the
same fingerprinted operation without duplicate records, and finally restores the
original encrypted backup to prove rollback leaves the old rows FAILED and
unreserved. A synthetic `ldk/` static-backup marker survives intact. Wrong keys,
changed context and corrupted ciphertext fail before extraction.

The application ledger and independent journal use separate authenticated
envelopes and keys. Their rehearsal restores an unknown payout, reconciles it
from exact wallet-history/lookup evidence, records it paid without another send,
and proves the original pre-reconciliation artifacts remain byte-for-byte
recoverable. Backup keys are caller-supplied and deliberately absent from the
artifacts; the byte-transform module never discovers paths, credentials or
runtime configuration.

This closes the isolated encrypted backup/restore/rollback gate, not live backup
operations. The test uses temporary SQLite, a synthetic marker and in-memory
keys. It does **not** open or validate a real LDK recovery phrase (`.recovery`),
channel backup, Hub workdir, production database, wallet credential or funds.
Before activation, operators must provision encrypted retention/key custody,
monitoring and a stopped/fenced restore procedure for the actual hosts. Spending
and public endpoints remain disabled.

### Real NWC relay transport accepted with no funds — 8 October 2026

`integrations/alby-fee-cap/run-relay-acceptance.py` completed one explicitly
opted-in round trip through `wss://relay.getalby.com`, one of the exact default
NWC relays in the reviewed Hub candidate. The allowlisted runner refuses an
arbitrary relay and creates fresh synthetic client/service keys, temporary
SQLite and Hub's mock LN backend. It never accepts an NWC URI or loads a wallet,
node credential, real invoice, preimage or funds.

The relay acknowledged and returned the exact signed, NIP-44-encrypted request.
The patched Hub event handler decrypted it, enforced the 100,000-msat fee cap,
processed a 123-sat testnet fixture through the mock backend, signed/encrypted
the correlated response, and published it back through the same relay. Exact
read-back, signature, author, request ID and decrypted result all passed. The
retained evidence contains only pass/fail results and hashes, not event payloads.

This closes the candidate's external relay transport gate. It is not a staging
or production Hub deployment and it does not prove the real wallet connection,
live retained-history provider, real balance isolation, managed backup/key
custody or a funded payout. The candidate remains disabled. Next is a separately
reviewed deployment package and rollback plan, followed—only with explicit
authorization—by a non-spending staging installation and fresh operational
evidence. A funded payout remains a later, independently authorized action.

### Default-disabled native server package — 8 October 2026

The separately reviewed package and rollback-plan checkpoint is now complete.
`build-candidate-server.py` starts from the exact clean upstream pin, applies the
five hashed patches, performs a frozen Yarn 1.22.22 install without changing the
lockfile, builds the HTTP frontend, runs the complete Go suite, and compiles the
Linux-amd64 Hub server plus migration binary and matching LDK shared library.
The resulting ignored local archive is
`bitcoinwalk-hub-candidate-6bb8520025d7.tar.gz`, SHA-256
`7d16c45975f8849918ba0606081ae7b6696d1ec64a8ae8919ee9fc57cbe9a28f`.
Its manifest binds upstream `a231ed34…223f`, reviewed candidate
`6bb85200…fa84`, architecture, patch hashes and explicit false
`productionReady`/`startEnabled` markers. It contains no wallet state,
credentials, recovery material or service configuration.

The non-root staging script accepts only an absolute, owned, non-symlink target
with an empty dedicated state directory. It rejects traversal paths, links,
special archive entries, multiple top-level releases, checksum failures and a
non-empty state directory. Staging changes only a candidate-local `current`
symlink. The rollback script verifies the prior release and only restores that
pointer; it does not start or stop a service. A packaged launcher exits 78 by
design. Internal checksums, native linkage to the packaged `libldk_node.so`,
isolated staging and pointer rollback passed. Negative tests confirmed that a
link-bearing archive and a non-empty state directory are refused.

This is packaging evidence, not a host deployment. It has not touched the live
Docker Hub, its data, the Rustress container or a wallet. Before even a
non-spending staging installation, audit a dedicated empty host root and create
a host-specific non-root service definition that remains disabled. Installation
requires an authorized non-root deployment account and separate explicit user
approval. Only after stopped/fenced backup readiness and fresh operational
evidence may the candidate be started without spending; funded acceptance is a
later and separately authorized gate.

### Rootless Docker staging — 9 October 2026

The user selected Docker and installed the single missing host prerequisite,
`uidmap`. Docker 29.8.0 now runs in the existing `bitcoinwalk` UID 1004 user
session on `.240` through RootlessKit 3.1.0 and its private user socket/storage.
The account still cannot access `/var/run/docker.sock`; it received neither the
root-equivalent Docker group nor sudo. The rootless daemon is enabled for that
already-lingering user, while the candidate container itself has no restart
policy and remains stopped.

`build-candidate-container.py` converts the verified native archive into a
deterministic Docker build-context bundle. The bundle SHA-256 is
`c47c7ae87c29f69a46092f480eae4070962feab862f95c1e5ee372901ffa7826`.
Both inputs are immutable amd64 manifests: Debian 12 slim
`a4672c0c…ee91` supplies the runtime, and the official Go 1.26.2 Bookworm image
`6b9b1ff2…4995` supplies only the CA certificate bundle missing from slim Debian.
The first build correctly stopped on that absent trust bundle; no container was
created and its temporary target was removed. The corrected build passed every
embedded checksum and produced image ID
`sha256:69f08f821ce7c41d43562f78ad75b973f10325fdd1c2853f2fbc230a6b5494df`
(265,685,337 bytes). Unused builder layers and cache were pruned afterwards.

The rootless container `bitcoinwalk-hub-feecap-candidate` is in Docker `created`
state with `Running=false`: it has never run. Its entrypoint refused the disabled
test with exit 78. The filesystem is read-only except for a new private bind
mount; that state contains only the exact candidate marker and no `albyhub`
directory, database, key, recovery material or wallet credential. The Compose
policy drops every capability, sets no-new-privileges, caps memory/tasks, has no
restart, exposes only candidate port 8080 to host loopback 127.0.0.1:18080 and
sets neither automatic unlock nor wallet/backend configuration. Nothing is
currently listening on 18080.

Removal through the candidate-specific rollback script preserved image/state,
and exact no-build rematerialization returned the same stopped image ID. The
existing public Hub still returns HTTP 200 and Rustress admin still returns its
expected unauthenticated HTTP 401. Rootless namespace isolation, rather than a
generic Docker grant, prevents this deployment account from managing those
root-owned containers. No Hub, Rustress or wallet state was read or changed.

The user separately authorized the no-spend start on 9 October. The exact image
was rematerialized with the explicit `reviewed-no-spend` gate and is now healthy
in the same rootless namespace. Docker reports `Running=true`, the expected image
ID, read-only root filesystem, no restart policy, no OOM/exit failure and only
`127.0.0.1:18080` bound to candidate port 8080. Public `GET /` and `GET /api/info`
both return HTTP 200. The non-sensitive readiness fields report the exact
`bitcoinwalk-feecap-6bb8520025d7` version with `setupCompleted=false`,
`running=false`, `unlocked=false` and an empty network: the HTTP process is up,
but no Hub wallet has been configured, started or unlocked.

The fresh bind mount contains only the safety marker, Hub log files and the
new unconfigured SQLite database/WAL files; no recovery file exists. No setup,
restore, start, unlock or backup endpoint was called, no existing data was
mounted, and no credential or wallet material was supplied. The existing public
Hub still returns HTTP 200 and Rustress admin retains its expected unauthenticated
HTTP 401. This completes the isolated no-spend HTTP runtime checkpoint only.
Connection-bound wallet/history evidence, managed encrypted retention and any
funded payout remain separate, explicitly authorized gates.

The backup checkpoint is now scheduled. A non-root sender on `.240`
now stops the candidate for a consistent snapshot, encrypts before transport and
uploads through a dedicated shell-denied key to an append-only receiver on
`.138`. Receiver-side retention is active. The user supplied only public key
`A206…B188`; it contains no secret key. The first retained ciphertext passed the
receiver checksum and the six-hour sender timer is enabled. A disposable-key
rehearsal also passed and all synthetic artifacts were removed. No wallet setup
or recovery file was created. The user then confirmed offline key custody and
independently ran the local verifier; six
required files, SQLite integrity, path/type safety and automatic decrypted-data
cleanup passed, with no temporary restore directory remaining. External failure
alerting and post-initialization wallet/history reconciliation remain open. See the
[backup and key-custody runbook](hub-candidate-backups.md).

Reviewed official tag v1.24.0, commit
`d8ef0e70e0d265a8424276daee0a595ac31993c0`:

- [Fee reserve and budget checks](https://github.com/getAlby/hub/blob/d8ef0e70e0d265a8424276daee0a595ac31993c0/transactions/transactions_service.go):
  reserve is `max(ceil(amount_msat * 0.01), 10000)` msat. LDK uses this
  as its routing-fee ceiling, not merely an accounting estimate.
- [LDK BOLT11 send path](https://github.com/getAlby/hub/blob/d8ef0e70e0d265a8424276daee0a595ac31993c0/lnclient/ldk/ldk.go):
  passes the calculated limit through `MaxTotalRoutingFeeMsat` to the node.
- [Budget usage](https://github.com/getAlby/hub/blob/d8ef0e70e0d265a8424276daee0a595ac31993c0/db/queries/get_budget_usage.go):
  pending and settled outgoing payments include amount, actual fees and reserved
  fees. Never-renewing budgets have no renewal cutoff. Zero MaxAmountSat does not
  impose a cap. Preflight must demand an explicit positive budget.
- Budget admission converts millisatoshis to whole sats with integer division;
  do not claim a byte-exact millisatoshi budget boundary. Keep our stricter
  integer preflight/reservations and bounded pilot; audit fractional residuals.
  Admission and pending creation are protected by an in-process mutex and DB
  transaction. This is not proof of safety for multiple Hub processes sharing DB.
- Isolated balances also subtract pending payments and fee reserves. They are
  accounting isolation within a node, not a separate node or backup boundary.

For a 79-sat payout this source applies a **10-sat maximum routing fee**. A
100-sat incoming payment would allocate 79 sats to the organizer and retain
21 sats before fees, at least 11 sats after fees within this source-enforced cap.
Actual fees may be lower. A 1-sat cap cannot be promised on this installed path.
Source review plus displayed version is not proof of the deployed binary or an
end-to-end payment test; recheck installed artifact/backend before activation.

Proposed first-pilot policy, **not approved or applied**: separate Rustress
connection, isolated balance, 100-sat non-renewing spending budget, one 79-sat
payout, maximum 10-sat routing fee paid by BitcoinWalk, 24-hour expiry. No funding
or connection creation until permission/scope and safe credential handover are
approved. Preserve receive-only checkout. Test budget rejection, fee handling,
lookup proof and unknown-send recovery before enabling public endpoints.

The Alby Hub skill guided the read-only UI review and separation of permissions,
budgets and isolated balances. No live NWC request or payment was made.

User clarification: 100 sats is an example, not a restriction on incoming zaps.
Every supported incoming amount follows the 79/21 allocation. BitcoinWalk has
approved covering routing fees from its share/wallet, preserving the organizer's
79%. Numeric spending budgets, fee ceilings and test authorization remain separate;
the proposed 100-sat pilot budget above has not been approved.
