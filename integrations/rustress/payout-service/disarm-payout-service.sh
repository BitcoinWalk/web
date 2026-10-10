#!/bin/sh
set -eu

service=bitcoinwalk-rustress-payout
parked="$service-disabled-rollback"
version=0.2.10
root="$HOME/.local/state/bitcoinwalk-rustress"
mode="$root/payout-mode"
socket="$root/payout-evidence-socket/evidence.sock"
expiry_unit=bitcoinwalk-payout-window-expiry
lock="$root/payout-window.lock"
write_mode(){ temporary="$root/.payout-mode.$$";trap 'rm -f "$temporary"' EXIT HUP INT TERM;umask 077;printf '%s\n' disabled>"$temporary";chmod 600 "$temporary";mv "$temporary" "$mode";trap - EXIT HUP INT TERM; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||exit 1
umask 077;exec 9>"$lock";chmod 600 "$lock";flock -w 90 9||exit 1

if docker container inspect "$service" >/dev/null 2>&1&&
 [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = "$version|disabled|none|running" ]&&
 ! docker container inspect "$parked" >/dev/null 2>&1;then
 write_mode
 rm -f "$socket"
 if [ "${1:-}" != --expired ];then systemctl --user stop "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user reset-failed "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user daemon-reload||true;fi
 printf '%s\n' "Payout service is already safely disabled."
 exit 0
fi

write_mode
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
if [ "${1:-}" != --expired ];then systemctl --user stop "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user reset-failed "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user daemon-reload||true;fi
printf '%s\n' "Payout service restored to the disabled network-isolated container."
