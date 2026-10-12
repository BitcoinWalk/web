# Rustress NIP-57 receipt authority

## Public receipt presentation — 11 October 2026

App `0.3.256` adds the missing public Pro-city zap and receipt UI. App `0.3.257`
routes invoice creation through a restricted same-origin boundary after a live
staging check exposed browser CORS blocking against the production LNURL host. It
accepts only `@bitcoinwalk.org`, validates the exact signed NIP-57 request,
amount, receipt-relay allow-list and exact city callback path, and returns only
the invoice and advertised receipt signer. The browser creates either an
extension-signed request or an explicit anonymous request and displays the
returned BOLT11 invoice. It uses a single live, reconnecting receipt subscription
in app `0.3.258`; payment
confirmation appears automatically after exact receipt verification, without a
manual check button, and closing the dialog closes every relay connection.
Three allow-listed public relays deliver the receipt.
Success is presented only after independently checking the kind-9735 signature
against the advertised provider, exact request and recipient, invoice amount,
description commitment, payment hash and preimage. The confirmation describes
only the incoming zap; it does not claim that the independent 79% organizer
payout has completed.

An event tag is used only when the exact event author is also the branded city
recipient. Older personal-authored walk events therefore remain profile zaps and
are never presented as city-authored. Basic-city donation behavior is unchanged.
Staging deployment and one browser payment/read-back acceptance remain before
this presentation slice is accepted.

Last reviewed: 11 October 2026

## Standalone HQ aliases — 13 October 2026

`donate@bitcoinwalk.org` and `endo@bitcoinwalk.org` remain no-split aliases for
the existing `bitcoinwalk@getalby.com` receiver. Their original Rustress
metadata exposed ordinary LNURL-pay only, which meant native clients such as
Primal correctly refused to request a Nostr zap invoice. App `0.3.294` resolves
this without creating another provider identity: discovery advertises the exact
NIP-57 capability and callback already operated by the destination wallet while
retaining the public BitcoinWalk identifier and description.

The adapter accepts only the pinned HTTPS GetAlby endpoint, exact callback path,
valid amount range, NIP-57 capability and 64-character lowercase signer key. It
fails closed on unavailable or changed metadata. A signed 10-sat BitcoinWalk
profile zap request produced an unpaid invoice during pre-deployment
verification; no test invoice was paid. Managed Pro-city callbacks and their
79/21 receipts remain unchanged.

## Decision

BitcoinWalk will use one dedicated NIP-57 provider identity to authorize zap
receipts. Its secret key must not be stored in Rustress, the web app, a browser,
the payout database or the NWC connection. Rustress may learn only the provider
public key. `allowsNostr: true` and `nostrPubkey` remain absent from public LNURL
metadata until the complete private authority, settlement lookup and durable
publisher have passed BW-88 native-zap acceptance. BW-102's ordinary LNURL/split
acceptance does not satisfy this requirement.

## BW-88 integration checkpoint — 11 October

The local worker candidate now accepts authenticated intake through an owner-only
Unix socket (`/run/bitcoinwalk-receipt-worker/socket/intake.sock`) while retaining
`network=none`. Disabled-mode health remains loopback-only inside its container.
`POST /v1/requests/validate` checks the exact signed request and returns its
description commitment before invoice creation; the provider must supply the
recipient, amount and canonical LNURL from trusted city state.
`POST /v1/receipts` persists a validated claim before acknowledging it with 202.
A bounded retry loop waits for authenticated settlement and retries signer or
publisher outages with durable backoff, retaining the exact signed receipt.
Pending intake is capped globally and per city by both count and encoded bytes;
each retry batch remains capped at ten. Shutdown drains
the in-flight batch before closing SQLite. Fifty-five focused authority, evidence,
signer, egress and socket tests, typecheck and candidate build pass.

This candidate is not deployed or activated. Remaining delivery order:

1. Verify the completed unpaid-invoice retention policy in the packaged runtime;
   retain a 30-day late-settlement recovery window and bounded admission. Reclaim
   only prepared claims after fresh authenticated unpaid evidence reaches that
   horizon; never reclaim paid, ambiguous, signed or publication-pending work.
2. Package and test the four-socket worker/signer/evidence/egress runtime with
   synthetic fixtures, outage/restart coverage, health gating and rollback.
3. Review the changed integration and obtain the separate bounded activation
   authorization; preserve the existing provider identity and recovery material.
4. Enable metadata only with that healthy path, then ask the user to make one
   bounded real Nostr zap. Independently verify the kind-9735 receipt and the
   separate 79/21 payout, including an external mobile client.
5. Finish the website's tier-aware native-zap action and receipt presentation
   (Basic supports HQ, Pro supports the branded city), then update acceptance.

### Unpaid retention and Docker checkpoint

The evidence service now reports a distinct `unsettled` observation only for an
exact, issued incoming invoice whose fresh wallet lookup says pending and has
no preimage or settlement timestamp. Its expiry is taken from the stored BOLT11,
not caller input. The receipt authority independently matches invoice amount,
payment hash, description commitment and expiry. After expiry plus 24 hours,
confirmed unpaid claims move to daily reconciliation; lookup failures or
contradictory evidence never establish unpaid status. Late settlement inside the
30-day recovery window resumes normal signing and clears dormant status. After
that window, only a still-prepared claim backed by a fresh exact unpaid lookup is
reclaimed. Signed, publication-pending and published events remain durable.
Admission caps are 1,000 active and 10,000 retained unpublished claims globally,
64 active and 1,024 retained per city, plus 64/256 MiB global and 4/32 MiB
per-city active/retained byte limits. The provider independently caps undelivered
outbox payloads at 1,024 global / 64 per city and 16/1 MiB, then replaces an
acknowledged full payload with a small durable tombstone. Exact retries remain
idempotent even at capacity; one city cannot consume another city's allocation.

The new synthetic Docker harness uses the actual worker and signer entrypoints,
temporary random identities, fake settlement/relay responses and four Unix
sockets. All containers use rootless Docker, `network=none`, read-only root
filesystems and dropped capabilities. It exercises failed publication, worker
restart and exact receipt reuse; it does not exercise the real wallet, Rust
provider binary, external WSS transport or production activation. Those retain
separate acceptance gates. Following explicit user approval, the harness passed
on `.240` as non-root user 1004 on 11 October 2026:
`RECEIPT_DOCKER_REHEARSAL_OK exact_receipt_reused=yes synthetic_only=yes`.
The actual worker and signer ran with four mounted Unix sockets, publication
failed until explicitly enabled in the fake publisher, and a worker restart
retained the exact receipt. Signer SQLite contained exactly one signed record.
Every test container's network mode was independently inspected as `none`.
The script removes its temporary containers on exit and retains only disposable
test data at `/tmp/bw-receipt-docker.k6eeVA8k`. No production state or key was
mounted and no live payment or public relay publication was attempted.

Uploaded source bundles: `/home/bitcoinwalk/bw88-synthetic-rehearsal.4zNdUkup`.
SHA-256 evidence:

- Worker: `8b55ecfc74cd3eb7f6130cb95b9a64038650c3a024b61656bf9a1dfed00a991c`
- Signer: `4e437cef9d5388f25fe238ef20582e4f255ff696aa6d4b2233f456e7e307b816`
- Fixture: `71a013efac0927608877b7b34b830af3934703331ae92b137499bb3f088d9adf`
- Shell harness: `1b778aa66547087a54c013f6dc3a9fed331c23525e06476c768c40fd233f646e`

Build its fixture bundle using esbuild from
`scripts/rehearse-receipt-docker-fixture.ts` (Node24, CJS). Place it alongside
`rustress-receipt-worker.cjs`, `rustress-receipt-signer.cjs` and
`integrations/rustress/receipt-service/rehearse-docker.sh` in a private temporary
directory, then invoke the shell script as the rootless Docker user. It never
mounts installed service state. Temporary fixture data is retained under a
reported `/tmp/bw-receipt-docker.*` directory; test containers are removed.

Deployment order for this private API addition: evidence-service candidate,
then worker candidate, then default-off Rustress intake. Existing consumers
fail closed on the new unsettled response. Public metadata remains unchanged.

### Cross-language source rehearsal

The real Rust `ReceiptBroker` now exercises the same Unix HTTP intake handler
used by the Node worker. The opt-in harness rejects a changed amount, validates
the exact signed request, queues its invoice claim and repeats delivery without
duplication. Synthetic evidence, signer and relay-egress sockets then simulate
an unavailable relay, reopen the authority database, and publish the same exact
signed receipt with one signature. No live wallet, provider key or public relay
is used. This is source-level integration evidence, not Docker mount/isolation
or production acceptance.

Verification: 61 focused Node receipt tests; 19 Rust provider tests (the combined
test is ignored in the default Rust run and passes separately via the harness);
web typecheck and worker build. Intake tests cover wrong authentication,
non-JSON, malformed and oversized input, plus unavailable wallet/signing routes.

Reproduce the combined test from the web repository with the Rustress source
path in `BW_RUSTRESS_REHEARSAL_SOURCE` and the installed cargo executable in
`BW_REHEARSAL_CARGO`, then run:
`npm test -- --run src/rustress/receipt-boundaries-rehearsal.test.ts`.
Use the pinned Rust toolchain and permit local Unix sockets. All generated keys
and invoices are disposable fixtures.

### Provider source wiring

Managed Rustress now has a default-off `BW_RECEIPT_INTAKE_ENABLED` boundary and a
separate owner-only intake token. City callbacks validate the signed zap through
the worker before invoice issuance. Rustress stores the exact request and its
city/key/payout-version snapshot in `bw_zap_outbox` before the wallet request;
after the invoice is durably recorded, the worker must acknowledge the exact
payment hash before the invoice is returned. An unavailable worker returns an
error rather than an invoice whose receipt request could be lost. Background
delivery retries use persisted backoff and bounded batches; exact duplicate
acknowledgements are harmless, while changed payloads are rejected. Ordinary
LNURL requests do not enter this path. Metadata remains unchanged.

Nineteen provider tests pass, including durable intent conflict rejection,
unavailable-socket backoff, exact acknowledgement and default-off callback
rejection. The 61-test receipt suite, web typecheck and worker candidate build
also pass. The upstream Rustress patch was regenerated from the pinned upstream
revision and reverse-application checked against the source tree. This is not
yet a combined deployed-provider/worker acceptance test. Packaging/mounts,
unpaid-request retention, activation authorization, real zap receipt acceptance
and website presentation remain; HQ/standalone native zaps are not enabled by
the city callback integration.

No production key, wallet permission, public metadata or payment was changed by
this implementation checkpoint. BW-88 remains In progress, not Done.

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
