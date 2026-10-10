#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout;parked="$service-invoice-only-rollback";root="$HOME/.local/state/bitcoinwalk-rustress";mode="$root/payout-mode";socket="$root/payout-evidence-socket/evidence.sock";lock="$root/payout-operation.lock";expiry_unit=bitcoinwalk-payout-operation-expiry;schedule="$HOME/.config/systemd/user/$expiry_unit.timer.d/schedule.conf"
fail(){ printf '%s\n' 'Could not restore invoice-only payout service.' >&2;exit 1; }
write_mode(){ temporary="$root/.payout-mode.$$";printf '%s\n' invoice-only>"$temporary";chmod 600 "$temporary";mv "$temporary" "$mode"; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
umask 077;exec 9>"$lock";chmod 600 "$lock";flock -w 90 9||fail
if [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}' 2>/dev/null||true)" = '0.2.14|invoice-only|host|running' ]&& ! docker container inspect "$parked" >/dev/null 2>&1;then write_mode;rm -f "$socket" "$schedule";systemctl --user disable --now "$expiry_unit.timer" >/dev/null 2>&1||true;systemctl --user daemon-reload||true;exit 0;fi
docker rm -f "$service" >/dev/null 2>&1||true;rm -f "$socket";write_mode;docker container inspect "$parked" >/dev/null 2>&1||fail;docker rename "$parked" "$service";docker start "$service" >/dev/null
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.14|invoice-only|host|running' ]||fail
rm -f "$schedule"
if [ "${1:-}" != --expired ];then systemctl --user disable --now "$expiry_unit.timer" >/dev/null 2>&1||true;systemctl --user stop "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user reset-failed "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user daemon-reload||true;fi
printf '%s\n' 'Rustress city payouts are closed; the standalone invoice-only service is active.'
