#!/bin/sh
set -eu
umask 077
test "$(id -un)" = bitcoinwalk
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
source_monitor="$here/monitor-operation.sh"
target="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/monitor.sh"
test -f "$source_monitor";test ! -L "$source_monitor";sh -n "$source_monitor"
grep -Fq 'while [ "$attempt" -le 4 ]' "$source_monitor"
grep -q 'attempt=.*sleep 5' "$source_monitor"
test -f "$target";test ! -L "$target"
backup=$(mktemp -d "$HOME/.local/state/bitcoinwalk-rustress/payout-monitor-0.2.14.1.XXXXXX")
cp -p "$target" "$backup/monitor.before"
install -m 700 "$source_monitor" "$target"
systemctl --user reset-failed bitcoinwalk-payout-operation-monitor.service
systemctl --user start bitcoinwalk-payout-operation-monitor.service
test "$(tr -d '\n'<"$HOME/.local/state/bitcoinwalk-rustress/payout-mode")" = operation
"$target"
printf '%s\n' "Payout monitor 0.2.14.1 accepted with bounded readiness retry. Backup: $backup"
