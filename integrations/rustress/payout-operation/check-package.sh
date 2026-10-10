#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
for name in install.sh start-operation.sh restore-invoice-only.sh monitor-operation.sh;do sh -n "$here/$name";done
grep -q 'version=0.2.14' "$here/install.sh";grep -q 'version=0.2.14' "$here/start-operation.sh"
grep -q '0.2.13|invoice-only|host|running' "$here/install.sh";grep -q 'RUSTRESS_PAYOUT_OPERATION_PREFLIGHT_OK' "$here/start-operation.sh"
grep -q 'operation-cities.json' "$here/start-operation.sh";grep -q 'cities=1' "$here/start-operation.sh"
grep -q -- '--restart unless-stopped --network host' "$here/start-operation.sh";grep -q 'invoice-only-rollback' "$here/restore-invoice-only.sh"
grep -q 'bitcoinwalk-payout-operation-expiry' "$here/start-operation.sh";grep -q 'flock -n 9' "$here/start-operation.sh"
grep -q 'Persistent=true' "$here/bitcoinwalk-payout-operation-expiry.timer";grep -q 'OnCalendar=@' "$here/start-operation.sh"
grep -q 'OnUnitActiveSec=5min' "$here/bitcoinwalk-payout-operation-monitor.timer"
grep -q 'ca20993a-5b7f-443e-931e-8dbaa61d05fe' "$here/operation-cities.json"
grep -q '"0.2.14"' "$here/refresh-host-evidence.py"
printf '%s\n' 'Payout operation package policy checks passed.'
