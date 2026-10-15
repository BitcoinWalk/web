#!/bin/sh
set -eu
umask 077
test "$(id -un)" = bitcoinwalk
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
source_monitor="$here/monitor-payout-operation-0.2.14.2.sh"
target="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/monitor.sh"
test -f "$source_monitor";test ! -L "$source_monitor";sh -n "$source_monitor"
grep -Fq 'body.mode!=="operation"' "$source_monitor"
grep -Fq 'body.unknown!==0||body.invoiceOutcomesUnknown!==0' "$source_monitor"
grep -Fq 'typeof body.ready!=="boolean"' "$source_monitor"
! grep -Fq 'body.operationExpiresAt' "$source_monitor"
! grep -Fq 'body.authorizedCities' "$source_monitor"
test -f "$target";test ! -L "$target"
backup=$(mktemp -d "$HOME/.local/state/bitcoinwalk-rustress/payout-monitor-0.2.14.3.XXXXXX")
cp -p "$target" "$backup/monitor.before"
install -m 700 "$source_monitor" "$target"
systemctl --user reset-failed bitcoinwalk-payout-operation-monitor.service
systemctl --user start bitcoinwalk-payout-operation-monitor.service
"$target"
printf '%s\n' "Payout monitor 0.2.14.3 accepted against the actual aggregate status contract. Transient readiness remains fail-closed; invalid operation structure, inactive expiry supervision, or ledger uncertainty still restores invoice-only mode. Backup: $backup"
