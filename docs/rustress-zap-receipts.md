# Rustress NIP-57 receipt authority

Last reviewed: 9 October 2026

## Decision

BitcoinWalk will use one dedicated NIP-57 provider identity to authorize zap
receipts. Its secret key must not be stored in Rustress, the web app, a browser,
the payout database or the NWC connection. Rustress may learn only the provider
public key. `allowsNostr: true` and `nostrPubkey` remain absent from public LNURL
metadata until the complete private authority, settlement lookup and durable
publisher have passed BW-102 acceptance.

The receipt confirms the incoming city invoice only. It does not assert that the
79% organizer forwarding payment has completed. Ordinary LNURL payments still
use the same 79/21 accounting but do not produce a fabricated zap receipt.

## Private flow

1. Rustress validates the signed kind-9734 zap request before asking for an
   invoice. It requires one matching city `p` tag, at most one `e`, `a` and `P`
   tag, an exact optional amount, one bounded relay list and the canonical city
   LNURL when supplied. Only the exact JSON string becomes the BOLT11 description
   hash; normalized or reconstructed JSON is not interchangeable.
2. The private issuer durably records the city, payout version, amount, exact
   description hash, invoice and payment hash before returning the invoice.
3. After an authenticated, connection-bound wallet lookup proves that exact
   incoming invoice settled, the payout service makes a narrow receipt claim
   available. The claim contains no payout destination, NWC URI or general wallet
   operation. The evidence binds city/version, invoice, hash, amount, description
   hash, settlement time and a matching preimage.
4. The receipt authority independently revalidates the kind-9734 signature and
   tags, decodes the BOLT11, verifies all commitments and builds the kind-9735
   template. A separate signer capability signs that template. The returned
   event is verified against every byte of the requested template before it is
   persisted.
5. The exact signed event is stored before relay publication. Retry after an
   outage or restart republishes the same event; a payment hash cannot be reused
   with different city, amount or request data. At least one requested relay must
   acknowledge before the job becomes published. Publication uses a bounded
   worker with DNS/IP revalidation and outbound controls; URL syntax checks alone
   are not sufficient SSRF protection.

The receipt uses the invoice `settled_at` as `created_at`, carries the recipient
`p`, sender `P`, optional target `e`/`a`/`k`, exact BOLT11 and exact JSON zap
request. BitcoinWalk also includes the verified preimage. This follows the
canonical NIP-57 receipt requirements while making retries deterministic.

## Implemented unconnected core

`src/rustress/zap-receipt-authority.ts` implements the private validation,
signing, persistence and publication state machine with injected capabilities.
It owns no NWC transport, payout destination or secret-key loader. Tests cover:

- valid receipt construction and exact required tags;
- signature, recipient, amount, relay and provider-key rejection;
- invoice hash, amount, description commitment and preimage rejection;
- durable prepared recovery after signer outage;
- exact signed-event reuse after publication outage and process restart;
- published idempotency, conflicting hash reuse and concurrent conflict denial;
- rejection of a signer that changes the reviewed template.

The next private boundary is also implemented but remains unconnected:

- payout candidate `0.2.3` adds a fifth, receipt-only credential and
  `/v1/receipts/evidence`; it can only read a previously issued exact city/version
  invoice and perform a fresh authenticated incoming lookup;
- evidence requires matching direction, settled state, invoice, payment hash,
  amount, description commitment, bounded settlement time and preimage;
- the loopback-only client sends only the city/version/hash/amount/commitment,
  validates the exact response and never receives an invoice-issuance, authority,
  operations or payout capability;
- the relay policy accepts at most three requested relays, intersects them with
  an operator allowlist, resolves DNS immediately before every attempt, rejects
  private/reserved/mixed or duplicate results, requires a pinned-address transport
  with TLS hostname verification and publishes only valid kind-9735 events;
- one relay failure does not hide another acknowledgement; no acknowledgement
  leaves the durable receipt pending for an exact retry.

Candidate `0.2.3` builds into a checksum-covered operator package. It has not
been installed. The currently deployed payout service remains disabled `0.2.2`.
No receipt credential has been created on the VPS and no real signer or relay
transport is connected.

This component is deliberately not exposed through `PayoutControlApi`, not built
into either deployed service and not connected to a signing key. No public LNURL
metadata changed and no invoice or payment was created.

## Remaining gates

1. Package the receipt authority as a separate non-root, loopback-only service
   with an owner-only key file or external signer. Add key rotation that retains
   the prior public identity long enough to validate historical receipts; never
   silently change the advertised provider key.
2. Implement the actual pinned-address WSS transport behind the reviewed relay
   policy, preserving TLS/SNI verification and enforcing container-level outbound
   controls. Confirm client compatibility with a conservative relay allowlist.
3. Add encrypted backup and isolated restore/republish rehearsals. Receipt state
   and provider-key recovery must not resend money or create a second event.
4. Obtain review by a person or team independent of the implementation. Review
   the signer/key boundary, wallet-evidence boundary, SSRF controls, SQLite crash
   states, relay publication and public metadata cutover. The implementation
   author’s tests are evidence for that review, not a substitute for it.
5. Only then run the explicitly authorized BW-102 fixture and bounded live zap,
   verify the receipt from an independent client, expire the activation window
   and review the ledger. `allowsNostr` stays false/absent until this passes.

## Source

The protocol baseline is the canonical Nostr NIP-57 specification:
<https://github.com/nostr-protocol/nips/blob/master/57.md>.
