#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
for name in install.sh start-operation.sh restore-invoice-only.sh monitor-operation.sh;do sh -n "$here/$name";done
grep -q 'version=0.2.16' "$here/install.sh";grep -q 'version=0.2.16' "$here/start-operation.sh"
grep -q '0.2.14|invoice-only|host|running' "$here/install.sh";grep -q 'RUSTRESS_PAYOUT_OPERATION_PREFLIGHT_OK' "$here/start-operation.sh"
! grep -q 'operation-cities.json' "$here/start-operation.sh";grep -q 'scope=verified-pro-entitlement-v1' "$here/start-operation.sh"
grep -q -- '--restart unless-stopped --network host' "$here/start-operation.sh";grep -q 'invoice-only-rollback' "$here/restore-invoice-only.sh"
grep -q 'bitcoinwalk-payout-operation-expiry' "$here/start-operation.sh";grep -q 'flock -n 9' "$here/start-operation.sh"
! grep -q 'OnCalendar=@' "$here/start-operation.sh";! grep -q 'is-active bitcoinwalk-payout-operation-expiry' "$here/monitor-operation.sh"
grep -q 'OnUnitActiveSec=5min' "$here/bitcoinwalk-payout-operation-monitor.timer"
grep -Fq 'while [ "$attempt" -le 4 ]' "$here/monitor-operation.sh";grep -q 'attempt=.*sleep 5' "$here/monitor-operation.sh"
grep -q '"0.2.16"' "$here/refresh-host-evidence.py";grep -q '"budgetRenewal": "monthly"' "$here/refresh-host-evidence.py"
printf '%s\n' 'Payout operation package policy checks passed.'
