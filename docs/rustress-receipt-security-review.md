# Rustress receipt-service independent security review

Review target: `44691fa61614b30aba2ad6be7f2dd94e8f18e475`

Implementation range: `3b80256^..44691fa`

Candidate package: `bitcoinwalk-rustress-receipt-service-0.1.0.tar.gz`

Candidate SHA-256: `a31e0f2c3af8e6ce99e010703be6326cec7066219b7f145c06409b4b9714bfb4`

Prepared: 9 October 2026

Current disposition, 9 October 2026: the independent review found two issues,
both subsequently remediated and re-tested. The identity anchor now comes from
an independently retained expected provider pubkey, and decompression/member
sizes are bounded before extraction. A later installer-only correction changed
the rootless-Docker spelling check and added an embedded assertion for it. The
resulting installed disabled package SHA-256 is
`ec220d284ae4222c1a58fc53a793acceaa5ad7ef44af90995d037f5db0b788eb`.
A later BW-100 checkpoint packages the relay transport into a separate
credential-free Unix-socket gateway and has package SHA-256
`0c2f22a6a8696ab8403f52b01eaa3682cd4c4be9cec5707e0e8aca0ceccd2363`.
Only the credential-free, `network=none` worker is running; the signer and relay
gateway are not started. The supplemental gateway change requires review before
activation. The original review target and digest below are retained as the
immutable input to that review.

## Review purpose

This review is a mandatory gate before a BitcoinWalk NIP-57 receipt authority can
be activated. The implementation author's tests and this packet are evidence for
an independent reviewer; they are not an approval. The reviewer should report
findings by severity, identify any assumptions that could not be verified and
give an explicit approve, approve-with-conditions or reject decision.

The candidate is not installed. It has no activation command, provider identity,
production credential, relay allowlist or production database. Public LNURL
metadata does not advertise Nostr receipt support. No real invoice, payment,
receipt or relay publication is part of this review.

## Security invariants

- The disabled installer may start only the worker, with `network=none`, no
  receipt credentials and no signer socket. It must fail if a signer container
  or relay-gateway container already exists.
- The signer must have no network and no wallet, payout-destination or relay
  capability. It can sign only a fully verified NIP-57 receipt over its owner-only
  Unix socket.
- The worker must never receive the provider secret or an NWC URI. Its four
  bearer capabilities—settlement evidence, signer, relay egress and receipt
  claim—must be distinct and narrowly scoped.
- The relay gateway must receive no provider secret, settlement evidence, NWC
  URI or wallet capability. It may publish only a valid kind-9735 event from the
  pinned provider to the operator-approved relay allowlist.
- A settled incoming invoice is necessary but insufficient. The invoice,
  payment hash, amount, description commitment, preimage, city/version and
  settlement time must all agree with the exact signed kind-9734 request.
- A payment hash has one immutable signed event. Exact retries must reuse it;
  changed retries must fail.
- Relay publication may target only operator-approved public WSS relays. DNS is
  resolved immediately before each connection, private/reserved/mixed answers
  fail, TLS validates the original hostname and success requires an exact positive
  Nostr `OK` for the exact event id.
- SQLite state must survive process failure without signing or publishing a
  different event on restart.
- Backups must be encrypted to the existing offline GPG recipient. Restores must
  verify exact inventory, hashes, SQLite integrity and that the restored secret
  derives the same pinned provider pubkey. The private decryption key and
  decrypted provider secret must never be copied to the VPS or displayed.
- Public `allowsNostr`/`nostrPubkey` metadata must stay absent until BW-102 passes.

## Trust boundaries and data flow

1. Rustress validates a kind-9734 request and issues an invoice whose description
   hash commits to the exact request JSON.
2. The payout service uses a dedicated receipt-only capability to return evidence
   for one already-issued, freshly verified incoming payment. It does not expose
   general wallet operations through this endpoint.
3. The receipt worker independently verifies the claim and asks the offline-
   network signer to sign one exact event template.
4. The signer independently repeats the protocol checks, stores the exact signed
   event durably by payment hash and returns it over the Unix socket.
5. The worker verifies the returned signature and template, stores the event
   before publication, and submits the exact stored event over an owner-only
   Unix socket to the credential-free relay gateway.
6. The gateway repeats event/provider validation and publishes only through the
   pinned allowlist, DNS and WSS transport.

Compromise of the public web app or Rustress adapter must not yield the provider
key or wallet-spending capability. Compromise of the worker's claim credential
must not be sufficient to sign without valid settlement evidence. Compromise of
the signer credential must not permit arbitrary Nostr signing. Compromise of one
relay must not redirect the worker to a private address or change the receipt.

## Files in scope

Core protocol and persistence:

- `src/rustress/zap-receipt-authority.ts`
- `src/rustress/receipt-signer.ts`
- `src/rustress/receipt-signer-socket.ts`
- `src/rustress/receipt-evidence-client.ts`
- `src/rustress/zap-relay-publisher.ts`
- `src/rustress/pinned-zap-websocket.ts`
- `src/rustress/receipt-relay-egress.ts`
- receipt-related changes in `src/rustress/payout-control-api.ts` and
  `src/rustress/payout-invoice-issuer.ts`

Runtime, packaging and recovery:

- `scripts/run-rustress-receipt-worker.ts`
- `scripts/run-rustress-receipt-relay-egress.ts`
- `scripts/run-rustress-receipt-signer.ts`
- `scripts/verify-rustress-receipt-worker.ts`
- `scripts/verify-rustress-receipt-restore.ts`
- `scripts/package-rustress-receipt-service.sh`
- `integrations/rustress/receipt-service/`
- `integrations/rustress/receipt-backup/`
- off-host receipt-backup changes in `integrations/rustress/payout-backup/`

Tests with the corresponding filenames are in scope as evidence, but the review
must also inspect the implementation paths they do not execute.

## Required review questions

1. Can any untrusted request make the signer sign something other than the exact
   valid kind-9735 event committed by the paid kind-9734 request and invoice?
2. Can a replay, concurrent call, crash or database rollback create two receipts,
   change a signed receipt or lose the only durable copy before publication?
3. Is any wallet, NWC, payout destination, provider secret or unrestricted API
   capability reachable across the wrong process boundary or emitted in status,
   errors, logs, images or backups?
4. Can DNS rebinding, multiple answers, IPv4/IPv6 representation, redirects,
   proxies, compression, TLS/SNI confusion or WebSocket framing bypass the public
   relay policy?
5. Are bearer comparisons, HTTP limits, Unix-socket permissions, uid mapping,
   file ownership/modes, symlink/hard-link checks and container mounts fail-closed
   under rootless Docker?
6. Can a malicious archive exploit path traversal, link handling, duplicate
   entries, type confusion, decompression size or unexpected inventory during an
   offline restore?
7. Can operational rollback, backup timing or key rotation cause identity drift,
   replay or a mismatch between public metadata and the active provider key?
8. Does the disabled installer have any path that creates credentials, starts the
   signer, grants network access, publishes a receipt or changes public metadata?

## Abuse cases to exercise

- forged or malformed request signatures and duplicate/conflicting tags;
- wrong city, recipient, sender, amount, invoice, hash, description or preimage;
- stale/future settlement timestamps and unpaid/outgoing/unknown transactions;
- duplicate, concurrent and changed claims for one payment hash;
- signer timeout, worker crash before/after signing, relay timeout and restart;
- signer returning a valid signature over a changed template;
- wrong/cross-role/reused bearer capabilities and oversized or non-JSON bodies;
- allowlisted hostname resolving to private, reserved, mixed or changed addresses;
- TLS certificate/SNI mismatch, redirect, compressed/oversized message and false
  or wrong-event Nostr acknowledgement;
- unsafe modes, ownership, uid map, symlinks, hard links or pre-existing socket;
- corrupt, incomplete, extra-file, wrong-key or wrong-component backup restores.

## Reproducible evidence

Run from a clean checkout of the review target with the lockfile unchanged:

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run rustress-receipt-service:package
npm run receipt-backup:check
```

Confirm the resulting package passes its embedded checks and record its digest.
Two consecutive builds from the review target must produce the pinned digest
above; archive order, timestamps, owner/group and gzip headers are normalized.
Do not use a production NWC connection, provider key, GPG private key, payment or
public relay during source review.

Pre-review evidence on 9 October 2026:

- 67 focused authority, signer, Unix-socket, evidence, relay-policy and pinned-WSS
  tests passed. The three Unix-socket tests required a test environment permitted
  to create a temporary local socket; they then passed without network access.
- receipt-service package policy checks passed;
- encrypted worker and signer backup fixture rehearsals passed;
- two consecutive package builds produced the pinned digest above;
- the 108-item public backlog build and repository diff checks passed.

No live npm advisory lookup was performed while preparing this packet because
that would disclose the repository dependency inventory to an external registry
without separate authorization. The independent reviewer should perform or
authorize a current production-dependency advisory check and record the result.

## Explicit blockers after source approval

Source approval alone does not authorize activation. All of these remain required:

- accept a minimal production relay allowlist;
- implement and independently verify an enforceable worker egress policy;
- create the dedicated provider identity through the approved offline procedure;
- produce encrypted production worker and signer backups;
- have the key custodian perform an offline restore rehearsal that proves the same
  provider pubkey without displaying secret material or starting network services;
- create a separate, time-bounded, independently reviewed activation and rollback
  package;
- explicitly authorize and pass BW-102 before changing public metadata.

## Reviewer decision record

- Reviewer/person or team:
- Review date:
- Reviewed commit and package digest:
- Findings by severity:
- Unverified assumptions:
- Required remediation:
- Decision: approve / approve with conditions / reject
- Signature or durable review reference:
