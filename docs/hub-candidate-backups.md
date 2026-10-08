# Isolated Hub candidate backup and key-custody runbook

## Current staging boundary — 9 October 2026

The fee-cap Hub candidate on `.240` now has a default-disabled, non-root backup
sender. Encrypted archives are accepted on the independent `.138` host by the
existing non-root `bitcoinwalk` account. The dedicated transport key is limited
by `authorized_keys` to one receiver command: it cannot obtain a shell, allocate
a terminal, forward ports/agents or select another destination. The `.138` SSH
host key is pinned on `.240`; its verified ED25519 fingerprint is
`SHA256:Rn5WqprBhTBN0GvRrYS0efQddu0aW7gA3SbiA9ZdC3M`.

The receiver writes a new 0600 archive under
`/home/bitcoinwalk/offhost-hub-backups/archives`, refuses duplicate names, uses
an atomic per-name lock, calculates its own SHA-256 receipt and never receives a
decryption key. Its enabled non-root timer retains all restore points from the
last 48 hours plus 14 daily, 8 weekly and 12 monthly restore points. Retention is
executed on the receiver; the restricted source transport cannot delete or
replace an accepted archive.

Before archiving, the sender verifies the exact candidate image, stops the
candidate container for a consistent filesystem snapshot, includes state plus
the pinned image/build manifests, encrypts locally to one public OpenPGP
recipient, restarts the container if it was previously running, uploads the
ciphertext and requires an exact receiver hash/size receipt. Confirmed encrypted
spool files older than two days are deleted locally. A failed operation restarts
the previously running container through its exit trap and does not claim
success.

The user created a dedicated RSA-4096 OpenPGP encryption key, expiring 7 October
2029, and supplied only its armored public half. The pinned fingerprint is
`A206 D095 A588 5B49 0A35 9B81 95B9 5ADD 2B41 B188`. The installed file was
verified to contain exactly one public key and zero secret keys. A private
decryption key must never be installed on either VPS.

The first retained archive,
`hub-feecap-20261008T232930Z-6bb8520025d7.tar.zst.gpg`, was accepted on `.138`
at 5,935 bytes with receiver-generated SHA-256
`1b3e8d7bcefbf4e7962d5c99a946d20ff102b5b59c686af9d02e868ee7eab386`.
Independent checksum verification passed, its mode is 0600 and the candidate
restarted on the exact reviewed image with HTTP 200. The six-hour `.240` sender
timer is now enabled and active; receiver retention remains enabled and active.
The key custodian must still store offline copies of the private key and its
passphrase in separately controlled locations.

## Acceptance performed

- Package checks cover shell/Python syntax, receiver receipt/checksum,
  duplicate refusal, probe and retention pruning (21 retained from 70 fixtures).
- A disposable synthetic public/private key exercised the complete `.240` to
  `.138` path with the candidate's still-unconfigured state.
- The receiver independently verified the encrypted archive checksum and mode
  0600. The candidate restarted healthy.
- The synthetic archive, local spool copy, test success marker, public recipient
  and disposable private key were removed afterwards.
- The real public recipient, first encrypted archive and scheduled sender are
  now active. There is still no Hub recovery file, wallet credential, setup,
  unlock or funds.

## Restore boundary

Restores are never automatic. Fence all payout senders, stop the candidate,
copy one encrypted archive to a trusted recovery workstation and let the key
custodian decrypt it there. Never send the private key or decrypted recovery
material to either VPS or to chat. Verify the recorded SHA-256 and manifest,
restore into a new isolated candidate root, then reconcile against the complete
independent wallet/journal history before enabling any sender. An older snapshot
must never be treated as proof that an uncertain payment did not occur.

This establishes an encrypted off-host staging path, retained archive and
scheduled receiver retention. It does not yet close production backup readiness:
confirmed independent private-key/passphrase custody, an independent human-run
decrypt/restore rehearsal, external timer-failure alerting and live wallet/
history reconciliation remain required.
