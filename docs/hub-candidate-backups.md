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

The sender service and six-hour timer are installed on `.240`, but the timer is
**disabled** and the service fails closed because
`recipient-public.asc` is deliberately absent. A private decryption key must
never be installed on either VPS. The key custodian must create or select an
offline-held OpenPGP encryption key and provide only its armored public key.
After the public key is reviewed and installed, enable the sender timer and run
one first real encrypted backup. Record the public-key fingerprint and store an
offline copy of the private key and its passphrase in separately controlled
locations.

## Acceptance performed

- Package checks cover shell/Python syntax, receiver receipt/checksum,
  duplicate refusal, probe and retention pruning (21 retained from 70 fixtures).
- A disposable synthetic public/private key exercised the complete `.240` to
  `.138` path with the candidate's still-unconfigured state.
- The receiver independently verified the encrypted archive checksum and mode
  0600. The candidate restarted healthy.
- The synthetic archive, local spool copy, test success marker, public recipient
  and disposable private key were removed afterwards.
- The production sender remains disabled, with no recipient key, Hub recovery
  file, wallet credentials, setup, unlock or funds.

## Restore boundary

Restores are never automatic. Fence all payout senders, stop the candidate,
copy one encrypted archive to a trusted recovery workstation and let the key
custodian decrypt it there. Never send the private key or decrypted recovery
material to either VPS or to chat. Verify the recorded SHA-256 and manifest,
restore into a new isolated candidate root, then reconcile against the complete
independent wallet/journal history before enabling any sender. An older snapshot
must never be treated as proof that an uncertain payment did not occur.

This establishes an encrypted off-host staging path and receiver retention. It
does not yet close production backup readiness: the offline public recipient,
first retained real archive, independent decrypt/restore rehearsal, external
timer-failure alerting and live wallet/history reconciliation remain required.
