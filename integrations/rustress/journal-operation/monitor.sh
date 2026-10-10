#!/bin/sh
set -eu
node=/opt/bitcoinwalk-app-staging/runtime/bin/node;controller="$HOME/.local/libexec/bitcoinwalk-journal-operation/control.cjs";operation="$HOME/journal-production-0.1.0/state/operation.json"
if [ "$(systemctl --user is-active bitcoinwalk-payout-journal-operation-expiry.timer 2>/dev/null||true)" = active ]&&"$node" "$controller" status "$operation" >/dev/null 2>&1;then exit 0;fi
"$node" "$controller" pause >/dev/null 2>&1||true
exit 1
