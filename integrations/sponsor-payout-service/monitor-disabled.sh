#!/usr/bin/env sh
set -eu
root="${BITCOINWALK_SPONSOR_PAYOUT_ROOT:-$HOME/.local/state/bitcoinwalk-sponsor-payout}";last="$root/backups/last-success";bin="$HOME/.local/libexec/bitcoinwalk-sponsor-payout";runtime=/usr/bin/python3
[ -x "$runtime" ] && [ -f "$bin/state-tool.py" ] || exit 1
"$runtime" "$bin/state-tool.py" verify-live "$root/state/status.json" "$root/mode" "$root/state/service.sqlite" >/dev/null
[ -f "$last" ] && [ ! -L "$last" ] || exit 1
set -- $(cat "$last");[ "$#" -eq 3 ] || exit 1;case "$2" in (*[!0-9a-f]*|'') exit 1;;esac;[ "${#2}" -eq 64 ]
stamp=$1;day=$(printf '%s' "$stamp"|cut -c1-8);hour=$(printf '%s' "$stamp"|cut -c10-11);minute=$(printf '%s' "$stamp"|cut -c12-13);second=$(printf '%s' "$stamp"|cut -c14-15)
case "$day$hour$minute$second" in (*[!0-9]*|'') exit 1;;esac
age=$(( $(date -u +%s)-$(date -u -d "$day $hour:$minute:$second UTC" +%s) ));[ "$age" -ge 0 ] && [ "$age" -le 28800 ]
printf 'SPONSOR_PAYOUT_MONITOR_OK backup_age_seconds=%s\n' "$age"
