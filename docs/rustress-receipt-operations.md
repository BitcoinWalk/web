# Rustress receipt-service operations

Last reviewed: 11 October 2026

## BW-88 candidate 0.1.1 — not installed

The `0.1.1` receipt candidate was built twice with identical SHA-256:
`f61dfc3f3702b712f17818e8a134e022ce04b259be41935507a26c8c26259a89`.
Package policies, typecheck and disposable-key encrypted backup/restore checks
pass (including wrong-key and oversized-archive rejection). Versioned worker,
signer, gateway, bootstrap and fallback backup-image references no longer reuse
the installed `0.1.0` tag. The package includes the synthetic Docker rehearsal
and a read-only `preflight-disabled.sh`; neither invokes the installer.

The preflight checks the candidate checksums, non-root service owner, rootless
Docker, disabled/network-isolated current worker, absent signer/gateway,
independently pinned public provider key, secret file **metadata only**, and
recent local backup-success receipts. It reads no secret content. Success is a
baseline check, not restore verification or activation authorization.

Following explicit payload-and-destination approval, this exact archive was
uploaded to `.240` as `bitcoinwalk` and its digest verified before extraction.
The packaged read-only check returned `RECEIPT_DISABLED_BASELINE_OK` on
11 October 2026. The candidate is staged under
`/home/bitcoinwalk/bw88-synthetic-rehearsal.4zNdUkup/bitcoinwalk-rustress-receipt-service-0.1.1`;
no installer, bootstrap or activation command has run. The earlier source-bundle
Docker rehearsal is recorded in `rustress-zap-receipts.md`.

The exact packaged Docker harness also passed:
`RECEIPT_DOCKER_REHEARSAL_OK exact_receipt_reused=yes synthetic_only=yes`.
It used disposable state at `/tmp/bw-receipt-docker.76TenHJ8`, verified all test
containers had no network, restarted the real worker after failed publication,
and confirmed byte-identical receipt reuse with one signer database record.
Temporary test containers were removed by the harness; fixture files remain
private for inspection. No real wallet, invoice payment or relay was used.

Remaining activation gates are concrete:

1. Package/review the matching payout-evidence and default-off Rustress changes;
   this receipt archive alone does not update either service.
2. Review the combined delta and implement/test a time-bounded activation and
   rollback procedure. The current package intentionally has no activation command.
3. Only after these gates pass, obtain approval for the exact city/amount/window,
   enable the healthy receipt path and perform one real external-client zap.
   Verify its NIP-57 receipt separately from the 79/21 organizer payout.

Do not rotate the existing provider key, rerun bootstrap, widen NWC permissions
or expose `allowsNostr` just because a candidate archive passes checks.

## Matching BW-88 candidates — staged, not installed

Prepared 11 October 2026, without running either installer:

| Artifact | SHA-256 |
| --- | --- |
| `bitcoinwalk-rustress-managed-0.1.5.tar.gz` | `616d7dfdf7d8cf2e4eb20b2fe58944f850977e4bb438a5fa49a4ae854274e646` |
| `bitcoinwalk-rustress-payout-operation-0.2.15.tar.gz` | `d9fab91dd9b3372ad2c3a43a0cccdb3b7cda853544bcfc4560b4f188f559ecc6` |

Rustress was built offline with the locked dependency file using Rust 1.90.0.
Its receipt intake is default-off; this binary does not advertise native-zap
support. The payout candidate carries the matching claim-bound unpaid evidence
response. Its runtime, Docker label, host-evidence helper and operation scripts
consistently name `0.2.15`. It refuses the existing `0.2.14` signed operation;
a newly signed release-bound operation is required, without widening the existing
city list, wallet capability, non-renewing budget or payout policy.

Validation: 483 Node Rustress tests, 19 Rust provider tests, typecheck, payout
package policy and the managed SQLite snapshot regression pass. Both archives
use normalized tar timestamps/ownership and gzip headers for reproducible builds.

Rollback review found that the existing managed updater copied a live SQLite
file and restored it on failure, risking missing WAL data or discarding requests
accepted after restart. The candidate now stops the service before taking a
SQLite backup-API snapshot, verifies its integrity, and restores only the prior
unit/binary on failure. It preserves the database, including additive BW-88
tables and accepted requests. A fixture proves WAL data is included, existing
snapshots cannot be overwritten, and later records remain in live state.
The subsequent isolated binary/schema rehearsal passed as described below;
production systemd installer rollback and live payment behavior remain separate.

### Required activation/rollback order

1. Stage the exact two archives as `bitcoinwalk` and verify their hashes. Keep
   receipt intake and NIP-57 metadata off throughout component upgrades.
2. Review the combined provider/evidence/receipt delta and rehearse code rollback
   against an isolated copy of migrated state. Never restore old ledgers over
   transactions accepted after startup. Never delete exact signed receipts.
3. Under an explicitly approved maintenance step, pause payout into its existing
   invoice-only rollback mode, install the new evidence runtime, and verify
   recovery against unchanged durable ledger/journal state. The installer
   deliberately refuses an active operation; do not bypass this prerequisite.
4. Obtain the release-bound payout signature and restore the existing city
   operation. Install Rustress with receipt intake off and confirm ordinary
   invoices/NIP-05 still work before enabling any native-zap path.
5. Implement and test the receipt-specific bounded activation and automatic
   expiry/rollback, including metadata health gating and the existing provider
   key. These deployment controls remain unfinished; the general payout
   authorization must not be treated as receipt activation authority.
6. Only then authorize one city, incoming amount and time window for a live
   external-client zap. Keep receipt verification separate from the organizer's
   79/21 payout check. Stop new zap invoices/metadata on failure, preserve all
   existing requests and signed events, and reconcile already accepted payments.

Following explicit approval, both new archives were uploaded to the same private
test directory on `.240`; archive and member checksums and payout package policy
passed. Neither installer was invoked. Two network-disabled rootless Docker
rehearsals then passed on 11 October:

- `MANAGED_BINARY_ROLLBACK_OK old_new_old_new=yes retained_outbox=yes synthetic_only=yes`:
  actual installed Rustress binary `2d26e1c4…a718` and the `0.1.5` candidate ran
  alternately as a non-root container user, with synthetic managed database and
  three random API tokens in tmpfs. The new receipt outbox survived rollback and
  re-upgrade; each stop passed SQLite integrity checks. Only executable copies
  and system libraries were mounted read-only, never production configuration.
- `PAYOUT_DISABLED_ROLLBACK_OK old_new_old_new=yes ledger_and_snapshot_preserved=yes synthetic_only=yes`:
  actual `0.2.14` and candidate `0.2.15` runtimes alternated against a disposable
  initialized ledger. Disabled-mode health reported no credential loaded, no
  invoice issuance and no payouts. Live ledger and managed snapshot retained the
  fixture record after every cycle. The only wallet placeholder was deliberately
  invalid; no wallet request was possible with `network=none`.

Reproducible fixture payloads are retained as
`scripts/rehearse-managed-binary-rollback.py` and
`scripts/rehearse-payout-disabled-rollback.cjs`; they require isolated tmpfs
mounts. These test direct binary/runtime compatibility, not execution of the
systemd upgrade scripts or a live operation with a new signed grant.
The initial Rust container attempt failed before process startup because the
base-image entrypoint was hidden by library mounts; explicitly selecting Python
resolved it without changing either artifact.

Post-test read-only checks confirmed receipt baseline still disabled, managed
Rustress service still active, and production payout still
`0.2.14|operation|running`. All rehearsal containers were disposable (`--rm`).
Production keys, SQLite databases, wallet permissions and public metadata were
not changed. Combined supplemental review and bounded receipt activation controls
are still required before any deployment or real zap test.

## Current state

The remediated `0.1.0` receipt-service package is installed on `.240` in its
strict disabled state. Package SHA-256 is
`eab59f707f949fa4dd84109e353bc65c0ae8d1e6d4ee7731ee2406664743ad1c`.
The embedded package checks and the 108-test focused payout/receipt suite pass. It creates three
different rootless images:

- `bitcoinwalk-rustress-receipt-worker` owns the receipt database, authenticated
  claim endpoint, payout-evidence client and Unix-socket clients for signing and
  relay publication. The installed worker is `disabled`, `network=none`, has
  no published port and mounts only its state plus the read-only disabled-mode
  file. It has no receipt, signer, payout or wallet credential.
- `bitcoinwalk-rustress-receipt-signer` owns the provider key and signer database.
  It has no exposed port and must always run with `network=none`. The worker can
  reach it only through an owner-only Unix socket. The signer image is built but
  no signer container exists.
- `bitcoinwalk-rustress-receipt-relay-egress` owns the approved relay allowlist,
  fresh DNS policy and IP-pinned, TLS-hostname-preserving WSS transport. It has
  no provider key, wallet, NWC or settlement-evidence capability, accepts only a
  valid kind-9735 event from the pinned provider over an authenticated owner-only
  Unix socket, and returns only exact positive relay acknowledgements. Its image
  is built, but no gateway container exists.

The package has no activation command. Activation is intentionally withheld until
the encrypted recovery rehearsal, conservative public relay allowlist, egress
policy and independent review are accepted. Installing `0.1.0` therefore cannot
enable NIP-57 metadata, create an invoice, sign a receipt or publish an event.

The first installation attempt failed closed before creating state because its
rootless-Docker check expected the wrong JSON spelling. The check and its package
test were corrected, the package was rebuilt under the digest above, and the
successful installation was independently inspected for mode, network, mounts,
ports, signer absence and provider-key absence.

The one-shot bootstrap subsequently created the dedicated provider identity in a
rootless `network=none` container and initialized an empty signer database without
starting the signer. Its independently retained public key is
`2443b1e4131ffc719cc80257b207ff1b29735356715b288715a438c22aabfe5a`.
The secret is owner-only on `.240` and has not been displayed in plaintext. With
the user's explicit authorization, the first worker and signer archives were
encrypted to offline GPG recipient `A206…B188`, accepted checksum-exact by the
receipt-aware off-host receiver on `.138`, and the twice-daily non-root timer was
enabled. The user ran both bounded offline restore checks: worker SQLite integrity
passed, signer SQLite integrity and the independently retained provider identity
matched, and decrypted material was removed automatically on exit.

## Runtime boundaries

The signer requires a separately pinned provider pubkey, matching owner-only
secret key, dedicated signer capability, owner-only state directory and socket
directory. It independently verifies the complete NIP-57 proof and refuses host
root, unexpected ownership/modes, symlinks, hard-linked secrets, a mismatched key,
changed retries and invalid SQLite state.

The armed worker will require four mutually distinct capabilities: payout
receipt-evidence, signer, relay egress and claim intake. It remains
`network=none`; settlement evidence, signing and relay publication use three
separate owner-only Unix sockets. Candidate payout `0.2.5` binds the exact evidence
route to the dedicated Unix transport; the generic localhost TCP API returns 404
for that route even with a correct receipt credential. Status, authority and
invoice routes remain unreachable through the evidence socket.
The gateway independently verifies the exact signed event and pinned provider
before the existing allowlist, public-address DNS and WSS policy runs.
The signer never receives wallet access, NWC, payout destinations or relay access,
and the gateway never receives a signing key or wallet capability.

## Backup and recovery candidate

`receipt-worker` and `receipt-signer` are separate encrypted backup components.
Both use an online SQLite snapshot and stream directly into the existing public
GPG recipient. The signer archive additionally contains the provider secret and
pinned public key. No private decryption key is placed on the VPS.

The offline restore verifier requires an exact archive inventory, checks every
manifest digest and SQLite integrity, then proves that the restored signer secret
derives both the archived public key and the independently retained expected
provider public key supplied by the custodian. Signer restore fails if that
external identity is absent or different. Decompression is bounded to 512 MiB
before extraction (and may be tightened, never raised, for a rehearsal), with a
128 MiB decoder-memory ceiling and 120-second decompression deadline. Temporary
decrypted material is removed on
exit. The automated fixture rehearsal passes for both components, rejects an
identity substitution and a compressed expansion fixture, and the off-host
receiver/retention policy recognizes both components without weakening its
duplicate or immutable-name controls.

The custodian must take `EXPECTED_PROVIDER_PUBKEY` from the independently kept
BitcoinWalk recovery record, never from the archive being tested:

```text
./verify-receipt-backup-restore.sh receipt-worker-….tar.zst.gpg worker
./verify-receipt-backup-restore.sh receipt-signer-….tar.zst.gpg signer EXPECTED_PROVIDER_PUBKEY
```

The production rehearsal used the existing offline GPG private key in an isolated
directory, proved the same provider pubkey, started no networked service and
published no receipt. The verifier removed decrypted material on exit. Future
rehearsals must preserve those properties; the agent must never read or display
the decrypted provider key or encrypted backup contents.

## Remaining acceptance gates

The approved allowlist is `nos.lol`, `relay.damus.io`, `relay.primal.net` and
`relay.ditto.pub`. It is installed owner-only while the worker remains
`network=none`. Current resolution from `.240` contains only public addresses.
NAT64, local NAT64, Teredo and 6to4 transition ranges are explicitly rejected
before transport; the focused relay policy/transport suite passes 30 tests.

1. Payout `0.2.6` is installed through the non-root service owner and accepted
   while disabled: `network=none`, no host port, no evidence socket, healthy
   monitor and ledger-preserving `0.2.6` → `0.2.5` → `0.2.6` rollback. The
   supplemental source review and joint synthetic three-socket outage/restart
   rehearsal also pass. Installed code/images are not activation acceptance.
2. The separately reviewed activation package now enforces an exact signed
   15-minute maximum, no armed-container restart, process self-expiry and timed
   restoration of the parked disabled baseline. It is installed but has no grant
   and has never been armed. Exercise one explicitly authorized window and prove
   automatic rollback. Older grants intentionally cannot arm release 0.2.6.
3. Only after explicit authorization, run BW-102 and then expose public NIP-57
   metadata.
