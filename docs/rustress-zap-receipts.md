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

The remaining private boundaries are now implemented as uninstalled candidates:

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
- the concrete WSS transport disables redirects and compression, connects only
  through the policy-approved address set, preserves the original hostname for
  TLS certificate and SNI validation, bounds handshake/message size/time and
  accepts only an exact positive Nostr `OK` for the exact event id;
- one relay failure does not hide another acknowledgement; no acknowledgement
  leaves the durable receipt pending for an exact retry.

The provider-key boundary is a separate signer process with no wallet, relay or
TCP listening capability. It speaks bounded HTTP only on an owner-only Unix socket, authenticates
a distinct bearer capability and independently verifies the signed kind-9734,
recipient/sender/provider tags, exact tag ordering, BOLT11 amount, description
commitment, payment hash, preimage and timestamp before signing. It durably stores
the exact signed event by payment hash, so an exact retry returns the same event
and any changed retry is refused. The runner derives the public key from its
owner-only secret file and refuses to start unless it matches a separately pinned
provider pubkey. It also refuses ordinary host-root execution; the intended
container has no network namespace access and shares only the Unix socket with
the receipt worker.

Payout `0.2.3` and receipt-service `0.1.0` are installed on `.240` in their safe
disabled states. Payout is rootless, `network=none`, has no published port and no
activation grant. The receipt package has separate rootless worker/signer images;
only the disabled `network=none` worker runs, and it mounts no credential or
signer socket. The signer image is built but no signer container, provider key or
relay allowlist exists. Encrypted worker and signer backup fixtures restore
successfully, including SQLite integrity and proof that the restored secret
derives the independently pinned provider pubkey. No real relay connection,
receipt signature or publication was attempted.

This component is deliberately not exposed through `PayoutControlApi`, not built
into either deployed service and not connected to a signing key. No public LNURL
metadata changed and no invoice or payment was created.

## Remaining gates

1. Select and accept a conservative relay allowlist and enforceable worker egress
   policy. Run the encrypted recovery rehearsal with the offline production GPG
   key in an isolated directory; prove the same provider pubkey and no publication.
   Treat the provider key as a stable public identity: normal rotation must not
   silently replace it; compromise recovery is an explicit metadata cutover.
2. Obtain review by a person or team independent of the implementation. Review
   the signer/key boundary, wallet-evidence boundary, SSRF controls, SQLite crash
   states, relay publication and public metadata cutover. The implementation
   author’s tests are evidence for that review, not a substitute for it. The
   [review packet](rustress-receipt-security-review.md) pins the exact commit,
   package digest, invariants, abuse cases and required decision record.
3. Add a separately reviewed, time-bounded activation/rollback package. Only then
   run the explicitly authorized BW-102 fixture and bounded live zap,
   verify the receipt from an independent client, expire the activation window
   and review the ledger. `allowsNostr` stays false/absent until this passes.

## Source

The protocol baseline is the canonical Nostr NIP-57 specification:
<https://github.com/nostr-protocol/nips/blob/master/57.md>.

The WSS client contract is based on the maintained `ws` client API:
<https://github.com/websockets/ws/blob/master/doc/ws.md>.
