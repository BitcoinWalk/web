#!/bin/sh
set -eu
node=/opt/bitcoinwalk-app-staging/runtime/bin/node;controller="$HOME/.local/libexec/bitcoinwalk-journal-operation/control.cjs";"$node" "$controller" pause
if [ "${1:-}" != --expired ];then systemctl --user disable --now bitcoinwalk-payout-journal-operation-expiry.timer >/dev/null 2>&1||true;fi
