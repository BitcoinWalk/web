# Rustress receipt-service operations

Last reviewed: 9 October 2026

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

1. Payout `0.2.5` is installed through the non-root service owner and accepted
   while disabled: `network=none`, no host port, no evidence socket, healthy
   monitor and ledger-preserving `0.2.5` → `0.2.4` → `0.2.5` rollback. The
   supplemental source review and joint synthetic three-socket outage/restart
   rehearsal also pass. Installed code/images are not activation acceptance.
2. Add a separately reviewed, time-bounded activation package and rollback. The
   existing older payout activation grant intentionally cannot arm release 0.2.5.
3. Only after explicit authorization, run BW-102 and then expose public NIP-57
   metadata.
