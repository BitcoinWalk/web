#!/bin/sh
set -eu

service=bitcoinwalk-rustress-payout
parked="$service-disabled-rollback"
version=0.2.10
image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-rustress"
state="$root/payout-service"
secrets="$root/secrets"
config="$root/payout-config"
mode="$root/payout-mode"
evidence_socket="$root/payout-evidence-socket"
expiry_unit=bitcoinwalk-payout-window-expiry
disarm="$HOME/.local/libexec/bitcoinwalk-rustress-payout-window/disarm.sh"
lock="$root/payout-window.lock"

fail(){ printf '%s\n' "Payout activation failed; service remains disabled." >&2;exit 1; }
write_mode(){ temporary="$root/.payout-mode.$$";umask 077;printf '%s\n' "$1">"$temporary";chmod 600 "$temporary";mv "$temporary" "$mode"; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
umask 077;exec 9>"$lock";chmod 600 "$lock";flock -n 9||fail
systemctl --user stop "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true
systemctl --user reset-failed "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true
systemctl --user daemon-reload||fail
docker info --format '{{json .SecurityOptions}}'|grep -q '"name=rootless"'||fail
[ -x "$disarm" ]&&[ -f "$mode" ]&&[ ! -L "$mode" ]&&[ "$(tr -d '\n'<"$mode")" = disabled ]||fail
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = "$version|disabled|none|running" ]||fail
! docker container inspect "$parked" >/dev/null 2>&1||fail
[ -d "$evidence_socket" ]&&[ ! -L "$evidence_socket" ]&&[ "$(stat -c '%U:%G:%a' "$evidence_socket")" = bitcoinwalk:bitcoinwalk:700 ]&&[ ! -e "$evidence_socket/evidence.sock" ]||fail
for name in nwc-uri journal-client-token intake-api-token issuer-api-token receipt-api-token authority-api-token operations-api-token;do path="$secrets/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
for name in checkout-client-pubkey journal-pin.json host-evidence.json activation.json;do path="$config/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done

preflight_mode="$root/.payout-mode.preflight.$$";trap 'rm -f "$preflight_mode"' EXIT HUP INT TERM
umask 077;printf '%s\n' armed>"$preflight_mode";chmod 600 "$preflight_mode"
common_mounts="--mount type=bind,src=$secrets/nwc-uri,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly --mount type=bind,src=$secrets/journal-client-token,dst=/run/bitcoinwalk-secrets/journal-client-token,readonly --mount type=bind,src=$secrets/intake-api-token,dst=/run/bitcoinwalk-secrets/intake-api-token,readonly --mount type=bind,src=$secrets/issuer-api-token,dst=/run/bitcoinwalk-secrets/issuer-api-token,readonly --mount type=bind,src=$secrets/receipt-api-token,dst=/run/bitcoinwalk-secrets/receipt-api-token,readonly --mount type=bind,src=$secrets/authority-api-token,dst=/run/bitcoinwalk-secrets/authority-api-token,readonly --mount type=bind,src=$secrets/operations-api-token,dst=/run/bitcoinwalk-secrets/operations-api-token,readonly --mount type=bind,src=$config/checkout-client-pubkey,dst=/run/bitcoinwalk-config/checkout-client-pubkey,readonly --mount type=bind,src=$config/journal-pin.json,dst=/run/bitcoinwalk-config/journal-pin.json,readonly --mount type=bind,src=$config/host-evidence.json,dst=/run/bitcoinwalk-config/host-evidence.json,readonly --mount type=bind,src=$config/activation.json,dst=/run/bitcoinwalk-config/activation.json,readonly --mount type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout --mount type=bind,src=$evidence_socket,dst=/run/bitcoinwalk-payout-evidence/socket"
# shellcheck disable=SC2086
preflight=$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 $common_mounts --mount "type=bind,src=$preflight_mode,dst=/run/bitcoinwalk-config/payout-mode,readonly" --env PAYOUT_PREFLIGHT=1 "$image")||fail
case "$preflight" in RUSTRESS_PAYOUT_PREFLIGHT_OK\ expiresAt=[0-9]*) expires=${preflight#*=};;*) fail;;esac
now=$(date -u +%s);remaining=$((expires-now));[ "$remaining" -ge 60 ]&&[ "$remaining" -le 900 ]||fail
rm -f "$preflight_mode";trap - EXIT HUP INT TERM
mounts="$common_mounts --mount type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly"

rollback(){
 trap - EXIT HUP INT TERM
 systemctl --user stop "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true
 rm -f "$evidence_socket/evidence.sock"
 write_mode disabled
 if docker container inspect "$parked" >/dev/null 2>&1;then docker rm -f "$service" >/dev/null 2>&1||true;docker rename "$parked" "$service"&&docker start "$service" >/dev/null||true
 elif docker container inspect "$service" >/dev/null 2>&1;then docker start "$service" >/dev/null 2>&1||true;fi
 fail
}
write_mode armed;trap rollback EXIT HUP INT TERM
docker stop "$service" >/dev/null||rollback
docker rename "$service" "$parked"||rollback
# shellcheck disable=SC2086
docker run -d --name "$service" --restart no --network host --label org.bitcoinwalk.service=rustress-payout --label org.bitcoinwalk.mode=armed --label "org.bitcoinwalk.version=$version" --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.5 $mounts --env NODE_ENV=production "$image" >/dev/null||rollback
systemd-run --user --quiet --unit "$expiry_unit" --on-active="${remaining}s" --timer-property=AccuracySec=1s "$disarm" --expired||rollback
[ "$(systemctl --user is-active "$expiry_unit.timer" 2>/dev/null)" = active ]||rollback
ready=0;i=0;while [ "$i" -lt 20 ];do if docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null 2>&1;then ready=1;break;fi;i=$((i+1));sleep 3;done
[ "$ready" -eq 1 ]||rollback
trap - EXIT HUP INT TERM
printf '%s\n' "Rustress payout service $version is active for at most $remaining seconds under the signed grant."
