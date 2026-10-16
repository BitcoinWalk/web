#!/usr/bin/env bash
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for script in backup-live-hub-state.sh verify-live-backup-restore.sh update-backup-host-pin.sh; do bash -n "$here/$script"; done

sender="$here/backup-live-hub-state.sh"
verifier="$here/verify-live-backup-restore.sh"
for required in \
  '--approved-stop-encrypt-upload' \
  'timeout 180 docker stop --time 120' \
  'restart_live' \
  'A206D095A5885B490A359B8195B95ADD2B41B188' \
  'runuser -u bitcoinwalk -- ssh' \
  'manual_unlock_required=yes'; do
  grep -Fq -- "$required" "$sender" || { echo "Missing live-backup safeguard: $required" >&2; exit 1; }
done
for forbidden in 'gpg --decrypt' 'docker exec' 'AUTO_UNLOCK_PASSWORD' 'pay_invoice' 'make_invoice'; do
  ! grep -Fq -- "$forbidden" "$sender" || { echo "Forbidden sender operation present: $forbidden" >&2; exit 1; }
done
grep -Fq 'decrypted_material_removed_on_exit=yes' "$verifier"
grep -Fq -- "-name '*.recovery'" "$verifier"
! grep -Fq 'cat ' "$verifier"
grep -Fq 'SHA256:rV8nNjpNrk6tr0gNdLf1ZsO0tqPTJ8Ad7cdvQTnFcNY' "$here/update-backup-host-pin.sh"
grep -Fq 'bitcoinwalk-hub-backup-receiver-ready' "$here/update-backup-host-pin.sh"
printf '%s\n' "Live Hub encrypted backup package passed."
