# Rustress receipt-service operations

Last reviewed: 9 October 2026

## Current state

The `0.1.0` receipt-service candidate is packaged but not installed. It creates
two different rootless images:

- `bitcoinwalk-rustress-receipt-worker` owns the receipt database, authenticated
  claim endpoint, payout-evidence client, relay allowlist, fresh DNS policy and
  pinned WSS transport. Its safe installation state is `disabled`, `network=none`
  and has no receipt, signer or payout credentials mounted.
- `bitcoinwalk-rustress-receipt-signer` owns the provider key and signer database.
  It has no exposed port and must always run with `network=none`. The worker can
  reach it only through an owner-only Unix socket. The disabled installer builds
  this image but deliberately does not start it or create a provider key.

The package has no activation command. Activation is intentionally withheld until
the encrypted recovery rehearsal, conservative public relay allowlist, egress
policy and independent review are accepted. Installing `0.1.0` therefore cannot
enable NIP-57 metadata, create an invoice, sign a receipt or publish an event.

## Runtime boundaries

The signer requires a separately pinned provider pubkey, matching owner-only
secret key, dedicated signer capability, owner-only state directory and socket
directory. It independently verifies the complete NIP-57 proof and refuses host
root, unexpected ownership/modes, symlinks, hard-linked secrets, a mismatched key,
changed retries and invalid SQLite state.

The armed worker will require three mutually distinct capabilities: payout
receipt-evidence, signer and claim intake. It may call only the payout evidence
endpoint on loopback, the signer Unix socket and allowlisted public WSS relays.
The worker's pinned transport disables redirect and compression, preserves TLS
hostname verification and accepts only the exact positive `OK` acknowledgement.
The signer never receives wallet access, NWC, payout destinations or relay access.

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

A production rehearsal remains mandatory. It must use the existing offline GPG
private key, restore into an isolated directory, prove the same provider pubkey,
start no networked service and publish no receipt. The agent must never read or
display the decrypted provider key or encrypted backup contents.

## Remaining acceptance gates

1. Select a conservative relay allowlist and define enforceable worker egress.
2. Create the provider identity outside the application, protect and encrypt it,
   then complete an isolated restore rehearsal proving the same public identity.
3. Add a separately reviewed, time-bounded activation package and rollback.
4. Only after explicit authorization, run BW-102 and then expose public NIP-57
   metadata.
