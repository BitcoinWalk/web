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

The user confirmed independent custody and completed the local-only restore
rehearsal on 9 October. `verify-backup-restore.sh` decrypted the retained
ciphertext through the user's local GPG agent, rejected unsafe paths and special
entries, extracted into a mode-0700 temporary directory, verified all required
candidate/build/state files, found no recovery file or symlink and returned
SQLite `PRAGMA integrity_check` success. It reported
`RESTORE_REHEARSAL_OK files=6 decrypted_material_removed_on_exit=yes`.
Post-run inspection found zero `bitcoinwalk-hub-restore.*` temporary directories;
only the mode-0600 ciphertext/checksum and mode-0700 verifier remain in the
private rehearsal folder. The agent never received the passphrase, private key,
decrypted archive or restored database.

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
- The key custodian confirmed offline storage and independently ran the restore
  verifier; structural, SQLite-integrity and automatic-cleanup acceptance passed.

## Restore boundary

Restores are never automatic. Fence all payout senders, stop the candidate,
copy one encrypted archive to a trusted recovery workstation and let the key
custodian decrypt it there. Never send the private key or decrypted recovery
material to either VPS or to chat. Verify the recorded SHA-256 and manifest,
restore into a new isolated candidate root, then reconcile against the complete
independent wallet/journal history before enabling any sender. An older snapshot
must never be treated as proof that an uncertain payment did not occur.

This establishes an encrypted off-host staging path, retained archive, scheduled
receiver retention, independent key custody and a human-run decrypt/restore
rehearsal. It does not yet close production backup readiness: external
timer-failure alerting and live wallet/history reconciliation remain required,
and the rehearsal must be repeated after the wallet is initialized and before
funds are introduced.

## Initialized production snapshot — 16 October 2026

The append-only receiver now accepts a separate `hub-live-*` namespace. Its
retention buckets are calculated independently per production image/candidate
pair, so candidate archives and production archives cannot displace one another.
The receiver and pruner update passed duplicate refusal, checksum receipt and
independent-stream retention fixtures before installation; no existing archive
was modified by the installer.

The previously pinned `.138` ED25519 key was stale after the documented host
replacement. The current public host key was read through the already
authenticated management connection and matched
`SHA256:rV8nNjpNrk6tr0gNdLf1ZsO0tqPTJ8Ad7cdvQTnFcNY`. The protected transport pin
was replaced atomically, its predecessor was retained locally, strict checking
remained enabled and the restricted receiver probe passed. No key scan was
trusted on its own.

With explicit approval, the live v1.24.0 Hub was stopped cleanly and its complete
initialized Docker volume streamed directly through Zstandard and OpenPGP
encryption to the pinned offline-held recipient. No plaintext duplicate or
private decryption key was created on either server. The receiver accepted
`hub-live-20261016T125224Z-2982a75a63c4-6bb8520025d7.tar.zst.gpg` at 29,793,627
bytes. Local and receiver copies are mode 0600, owned by their non-root
`bitcoinwalk` accounts and independently match SHA-256
`318d3b31a438b952109012ab8d7de0232576afcb0931ad45392264c6c72ac4b6`.
The public Hub returned after the snapshot and awaits its normal human unlock.

The ciphertext, receiver checksum and a verifier have also been copied to a
mode-0700 folder on the trusted workstation. The agent has not decrypted or read
the archive. Production restore readiness remains open until the key custodian
runs that verifier locally, confirms path/type safety, SQLite integrity and
automatic decrypted-data cleanup, and the running Hub is checked again after
manual unlock.
