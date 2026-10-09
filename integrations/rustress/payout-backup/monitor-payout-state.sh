#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 && "$1" =~ ^(ledger|journal)$ ]] || exit 64
component="$1";last="$HOME/.local/state/bitcoinwalk-payout-backup-$component/last-success"
[[ -f "$last" && ! -L "$last" && "$(stat -c '%U:%G:%a' "$last")" == bitcoinwalk:bitcoinwalk:600 ]] || exit 1
read -r timestamp checksum size < "$last"
[[ "$checksum" =~ ^[0-9a-f]{64}$ && "$size" =~ ^[1-9][0-9]*$ ]] || exit 1
age=$(( $(date -u +%s) - $(date -u -d "${timestamp:0:8} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2} UTC" +%s) ))
(( age >= 0 && age <= 28800 )) || exit 1
if [[ "$component" == ledger ]]; then
  value="$(docker inspect bitcoinwalk-rustress-payout --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')"
  [[ "$value" == '0.2.4|disabled|none|running' ]]
  docker exec bitcoinwalk-rustress-payout node /app/verify-rustress-payout-service.cjs >/dev/null
else
  systemctl --user --quiet is-active bitcoinwalk-payout-journal.service
  systemctl --user --quiet is-active bitcoinwalk-journal-tunnel.service
  token="$HOME/journal-production-0.1.0/state/client.token"
  [[ -f "$token" && ! -L "$token" && "$(stat -c '%U:%G:%a' "$token")" == bitcoinwalk:bitcoinwalk:600 ]]
  curl --fail --silent --show-error --max-time 5 -H "Authorization: Bearer $(<"$token")" http://127.0.0.1:8894/v1/journal/status >/dev/null
fi
printf 'PAYOUT_MONITOR_OK component=%s backup_age_seconds=%s\n' "$component" "$age"
