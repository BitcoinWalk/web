#!/bin/sh
set -eu
root="$HOME/journal-production-0.1.0/state";candidate="${1:-$HOME/incoming/payout-operation-0.2.14.json}";active="$root/operation.json";node=/opt/bitcoinwalk-app-staging/runtime/bin/node;controller="$HOME/.local/libexec/bitcoinwalk-journal-operation/control.cjs";unit=bitcoinwalk-payout-journal-operation-expiry;lock="$root/operation.lock"
fail(){ "$node" "$controller" pause >/dev/null 2>&1||true;printf '%s\n' 'Payout journal operation start failed; the journal was paused.' >&2;exit 1;}
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail;umask 077;exec 9>"$lock";chmod 600 "$lock";flock -n 9||fail
result=$("$node" "$controller" inspect "$candidate")||fail;case "$result" in PAYOUT_JOURNAL_OPERATION_VALID\ expiresAt=[0-9]*) expires=${result##*=};;*) fail;;esac
now=$(date -u +%s);remaining=$((expires-now));[ "$remaining" -ge 604800 ]&&[ "$remaining" -le 2592000 ]||fail
cp "$candidate" "$active";chmod 600 "$active";schedule="$HOME/.config/systemd/user/$unit.timer.d/schedule.conf";mkdir -p "$(dirname "$schedule")"
printf '%s\n' '[Timer]' 'OnCalendar=' "OnCalendar=@$expires" 'Persistent=true' 'AccuracySec=5s'>"$schedule";chmod 600 "$schedule"
systemctl --user stop bitcoinwalk-journal-window-expiry.timer bitcoinwalk-journal-window-expiry.service >/dev/null 2>&1||true
systemctl --user daemon-reload||fail;systemctl --user enable --now "$unit.timer" >/dev/null||fail;[ "$(systemctl --user is-active "$unit.timer")" = active ]||fail
"$node" "$controller" activate "$active"||fail;systemctl --user enable --now bitcoinwalk-payout-journal-operation-monitor.timer >/dev/null||fail
rm -f "$candidate";printf '%s\n' "Production payout journal is bound to the signed Madeira operation until epoch $expires."
