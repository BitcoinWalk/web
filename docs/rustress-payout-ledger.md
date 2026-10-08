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

## Deliberate boundaries / next slice

The ledger is an internal accounting primitive, not proof that a payment happened.
Its caller must authenticate and verify settlement with the bound receiving wallet;
it must never forward browser JSON or an unverified notification directly to settle.

Before runtime integration, implement and test:

1. Integrate the isolated recipient adapter with immutable obligations and the
   worker; review provider compatibility, outbound egress policy and response
   limits before real requests. Add reviewed IPv6/cross-origin support if needed.
2. A connection-bound collector and real wallet adapter, notification deduplication plus paged
   settlement catch-up, authenticated wallet lookup, fee/budget enforcement and
   unknown-send reconciliation. A missing lookup result is not a failed payment.
3. Reviewed definitive-failure recovery and expired unsent invoice replacement;
   never release an uncertain payment merely because its invoice has expired.
4. Backup/restore reconciliation against wallet history before resuming sends;
   restoring an old database must not replay already completed payments.
5. Rustress adapter integration, one forwarding authority, capability gates,
   alerts, private operational views and explicit authorization for a bounded
   live test. Keep checkout's receive-only connection unchanged.

Tests cover duplicate settlement, immutable snapshots, large integer arithmetic,
fractional carry-forward, recipient limits, cross-city/wallet/version isolation,
atomic allocations, duplicate hash rollback, two SQLite handles claiming once,
restart while outcome is unknown, restart after payment, preimage validation,
fee conflicts and conservation of every allocated millisatoshi. They use only
synthetic records and temporary local databases, not real invoices or funds.

Verification: 994 tests across 182 files pass on Node 24, including 15 ledger
tests and 24 outgoing-invoice/worker tests. This slice adds 35 fixture tests for
recipient retrieval, pinned HTTPS transport and outgoing wallet lookup validation.
The authenticated reader adds 16 fixture tests for signatures, correlation,
checkout isolation, read-only methods, timeouts and integrated payout proof checks.
TypeScript, changed-file lint and
backlog checks pass. No staging/production
release is needed for this unconnected component.
