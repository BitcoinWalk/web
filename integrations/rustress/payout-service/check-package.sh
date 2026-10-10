#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
for name in install.sh arm.sh disarm.sh rehearse-disabled-rollback.sh;do sh -n "$here/$name";done
grep -q 'version=0.2.10' "$here/install.sh"
grep -q 'version=0.2.10' "$here/arm.sh"
grep -q 'candidate="$service:0.2.10"' "$here/rehearse-disabled-rollback.sh"
grep -q 'previous="$service:0.2.9"' "$here/rehearse-disabled-rollback.sh"
grep -q -- '--network none' "$here/install.sh"
grep -q 'payout-evidence-socket' "$here/arm.sh"
grep -q 'evidence.sock' "$here/disarm.sh"
grep -q "0.2.10|disabled|none|running" "$here/monitor-payout-state.sh"
grep -q 'capture-rustress-accepted-prior-spend.cjs' "$here/Dockerfile"
grep -q '/run/bitcoinwalk-payout-evidence/socket/evidence.sock' "$here/rustress-payout-service.cjs"
! grep -q '127.0.0.1:8893/v1/receipts/evidence' "$here/rustress-payout-service.cjs"
grep -q 'transport === "receipt-evidence"' "$here/rustress-payout-service.cjs"
grep -Eq 'MAXIMUM_PAYOUT_OPERATION_SECONDS ?= ?30 \* 24 \* 60 \* 60' "$here/rustress-payout-service.cjs"
grep -q -- '--restart no --network host' "$here/arm.sh"
grep -q 'systemd-run --user --quiet --unit' "$here/arm.sh"
grep -q 'systemctl --user is-active' "$here/arm.sh"
grep -q 'disabled-rollback' "$here/arm.sh"
grep -q 'disabled-rollback' "$here/disarm.sh"
grep -q 'bitcoinwalk-rustress-payout-window' "$here/install.sh"
grep -q 'monitor.previous-\$version' "$here/install.sh"
grep -q 'rm -f "$monitor_previous"' "$here/install.sh"
grep -q 'flock -n 9' "$here/arm.sh"
grep -q 'flock -w 90 9' "$here/disarm.sh"
grep -q 'already safely disabled' "$here/disarm.sh"
printf '%s\n' 'Payout service package policy checks passed.'
