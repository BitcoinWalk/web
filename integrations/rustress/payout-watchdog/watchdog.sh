#!/bin/sh
set -eu
monitor="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/monitor.sh";restore="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/restore.sh"
if "$monitor";then exit 0;fi
"$restore"
printf '%s\n' 'Payout operation failed its health check and was restored to invoice-only mode.' >&2
exit 1
