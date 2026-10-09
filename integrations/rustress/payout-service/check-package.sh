#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
for name in install.sh arm.sh disarm.sh rehearse-disabled-rollback.sh;do sh -n "$here/$name";done
grep -q 'version=0.2.5' "$here/install.sh"
grep -q 'version=0.2.5' "$here/arm.sh"
grep -q 'candidate="$service:0.2.5"' "$here/rehearse-disabled-rollback.sh"
grep -q 'previous="$service:0.2.4"' "$here/rehearse-disabled-rollback.sh"
grep -q -- '--network none' "$here/install.sh"
grep -q 'payout-evidence-socket' "$here/arm.sh"
grep -q 'evidence.sock' "$here/disarm.sh"
grep -q "0.2.5|disabled|none|running" "$here/monitor-payout-state.sh"
grep -q '/run/bitcoinwalk-payout-evidence/socket/evidence.sock' "$here/rustress-payout-service.cjs"
! grep -q '127.0.0.1:8893/v1/receipts/evidence' "$here/rustress-payout-service.cjs"
grep -q 'transport === "receipt-evidence"' "$here/rustress-payout-service.cjs"
printf '%s\n' 'Payout service package policy checks passed.'
