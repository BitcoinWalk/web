#!/bin/sh
set -eu

service=bitcoinwalk-rustress-payout
parked="$service-disabled-rollback"
root="$HOME/.local/state/bitcoinwalk-rustress"
mode="$root/payout-mode"
socket="$root/payout-evidence-socket/evidence.sock"
expiry_unit=bitcoinwalk-payout-window-expiry
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||exit 1

temporary="$root/.payout-mode.$$";trap 'rm -f "$temporary"' EXIT HUP INT TERM
umask 077;printf '%s\n' disabled>"$temporary";chmod 600 "$temporary";mv "$temporary" "$mode";trap - EXIT HUP INT TERM
docker rm -f "$service" >/dev/null 2>&1||true
rm -f "$socket"
if docker container inspect "$parked" >/dev/null 2>&1;then
 docker rename "$parked" "$service"
 docker start "$service" >/dev/null
 docker exec "$service" node /app/verify-rustress-payout-service.cjs >/dev/null
else
 printf '%s\n' "Payout service is disabled and stopped; disabled rollback container is missing." >&2
 exit 1
fi
if [ "${1:-}" != --expired ];then systemctl --user stop "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true;fi
printf '%s\n' "Payout service restored to the disabled network-isolated container."
