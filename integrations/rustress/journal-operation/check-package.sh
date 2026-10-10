#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
for f in install.sh start.sh monitor.sh pause.sh;do sh -n "$here/$f";done
grep -q '0.2.14' "$here/control.cjs";grep -q 'OnCalendar=@' "$here/start.sh";grep -q 'Persistent=true' "$here/bitcoinwalk-payout-journal-operation-expiry.timer"
grep -q 'OnUnitActiveSec=1min' "$here/bitcoinwalk-payout-journal-operation-monitor.timer";grep -q '"$node" "$controller" pause' "$here/monitor.sh"
printf '%s\n' 'Payout journal operation package policy checks passed.'
