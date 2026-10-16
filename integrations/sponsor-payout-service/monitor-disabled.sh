#!/usr/bin/env sh
set -eu
service=bitcoinwalk-sponsor-payout;version=0.1.0
root="${BITCOINWALK_SPONSOR_PAYOUT_ROOT:-$HOME/.local/state/bitcoinwalk-sponsor-payout}";last="$root/backups/last-success"
value=$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.State.Status}}')
[ "$value" = "$version|disabled|none|true|running" ]
docker exec "$service" node /app/verify-sponsor-payout-service.cjs >/dev/null
[ -f "$last" ] && [ ! -L "$last" ] || exit 1
set -- $(cat "$last");[ "$#" -eq 3 ] || exit 1;case "$2" in (*[!0-9a-f]*|'') exit 1;;esac;[ "${#2}" -eq 64 ]
stamp=$1;day=$(printf '%s' "$stamp"|cut -c1-8);hour=$(printf '%s' "$stamp"|cut -c10-11);minute=$(printf '%s' "$stamp"|cut -c12-13);second=$(printf '%s' "$stamp"|cut -c14-15)
case "$day$hour$minute$second" in (*[!0-9]*|'') exit 1;;esac
age=$(( $(date -u +%s)-$(date -u -d "$day $hour:$minute:$second UTC" +%s) ));[ "$age" -ge 0 ] && [ "$age" -le 28800 ]
printf 'SPONSOR_PAYOUT_MONITOR_OK backup_age_seconds=%s\n' "$age"
