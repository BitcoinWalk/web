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
