#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
sh -n "$here/install-disabled.sh"
grep -q '^ENTRYPOINT \["node","/app/rustress-receipt-signer.cjs"\]$' "$here/Dockerfile.signer"
! grep -q '^EXPOSE ' "$here/Dockerfile.signer"
grep -q -- '--network none' "$here/install-disabled.sh"
grep -q -- '"name=rootless"' "$here/install-disabled.sh"
grep -q -- '--cap-drop ALL' "$here/install-disabled.sh"
grep -q -- '--security-opt no-new-privileges:true' "$here/install-disabled.sh"
grep -q 'docker container inspect "$service-signer"' "$here/install-disabled.sh"
test -x "$here/backup-receipt-state.sh" -a -x "$here/verify-receipt-backup-restore.sh" -a -f "$here/verify-rustress-receipt-restore.cjs"
grep -q 'receipt-(worker|signer)' "$here/offhost-receive-encrypted-backup.sh"
printf '%s\n' "Receipt service package policy checks passed."
