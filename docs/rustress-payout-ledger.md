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
4. Production restore tooling, independent journal durability, sender fencing and
   authenticated complete-history collection for the tested recovery gate.
5. Rustress adapter integration, one forwarding authority, capability gates,
   alerts, private operational views and explicit authorization for a bounded
   live test. Keep checkout's receive-only connection unchanged.

Tests cover duplicate settlement, immutable snapshots, large integer arithmetic,
fractional carry-forward, recipient limits, cross-city/wallet/version isolation,
atomic allocations, duplicate hash rollback, two SQLite handles claiming once,
restart while outcome is unknown, restart after payment, preimage validation,
fee conflicts and conservation of every allocated millisatoshi. They use only
synthetic records and temporary local databases, not real invoices or funds.

Verification: 1,028 tests across 184 files pass on Node 24, including 15 ledger
tests and 24 outgoing-invoice/worker tests. This slice adds 35 fixture tests for
recipient retrieval, pinned HTTPS transport and outgoing wallet lookup validation.
The authenticated reader adds 16 fixture tests for signatures, correlation,
checkout isolation, read-only methods, timeouts and integrated payout proof checks.
The integrated flow adds 18 tests for multiple payment amounts, duplicate credit,
forged settlement, minimum/maximum payouts, endpoint outage, immutable recipients,
budget sharing, authorization failures, missed notifications and restart recovery.
Restore coverage adds 15 independent-journal/older-backup tests plus an integrated
missing-guard denial test. These use only synthetic wallets and temporary files.
TypeScript, changed-file lint and
backlog checks pass. No staging/production
release is needed for this unconnected component.
