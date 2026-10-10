#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout;parked="$service-invoice-only-rollback";version=0.2.14;image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-rustress";state="$root/payout-service";secrets="$root/secrets";config="$root/payout-config";mode="$root/payout-mode";socket="$root/payout-evidence-socket"
expiry_unit=bitcoinwalk-payout-operation-expiry;restore="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/restore.sh";lock="$root/payout-operation.lock"
candidate="${1:-$config/operation.next.json}"
fail(){ printf '%s\n' 'Payout operation start failed; invoice-only mode was restored when possible.' >&2;exit 1; }
write_mode(){ temporary="$root/.payout-mode.$$";printf '%s\n' "$1">"$temporary";chmod 600 "$temporary";mv "$temporary" "$mode"; }
start_invoice(){ write_mode invoice-only;docker container inspect "$parked" >/dev/null 2>&1||return 1;docker rename "$parked" "$service"&&docker start "$service" >/dev/null; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
umask 077;exec 9>"$lock";chmod 600 "$lock";flock -n 9||fail
for name in nwc-uri journal-client-token intake-api-token issuer-api-token receipt-api-token authority-api-token operations-api-token;do path="$secrets/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
for name in checkout-client-pubkey journal-pin.json host-evidence.json operation-cities.json;do path="$config/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
[ -f "$candidate" ]&&[ ! -L "$candidate" ]&&[ "$(stat -c '%U:%G:%a' "$candidate")" = bitcoinwalk:bitcoinwalk:600 ]||fail
[ -d "$socket" ]&&[ ! -L "$socket" ]&&[ "$(stat -c '%U:%G:%a' "$socket")" = bitcoinwalk:bitcoinwalk:700 ]||fail
systemctl --user disable --now "$expiry_unit.timer" >/dev/null 2>&1||true;systemctl --user stop "$expiry_unit.service" >/dev/null 2>&1||true;systemctl --user reset-failed "$expiry_unit.timer" "$expiry_unit.service" >/dev/null 2>&1||true
preflight_mode="$root/.payout-mode.preflight.$$";printf '%s\n' operation>"$preflight_mode";chmod 600 "$preflight_mode"
common="--mount type=bind,src=$secrets/nwc-uri,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly --mount type=bind,src=$secrets/journal-client-token,dst=/run/bitcoinwalk-secrets/journal-client-token,readonly --mount type=bind,src=$secrets/intake-api-token,dst=/run/bitcoinwalk-secrets/intake-api-token,readonly --mount type=bind,src=$secrets/issuer-api-token,dst=/run/bitcoinwalk-secrets/issuer-api-token,readonly --mount type=bind,src=$secrets/receipt-api-token,dst=/run/bitcoinwalk-secrets/receipt-api-token,readonly --mount type=bind,src=$secrets/authority-api-token,dst=/run/bitcoinwalk-secrets/authority-api-token,readonly --mount type=bind,src=$secrets/operations-api-token,dst=/run/bitcoinwalk-secrets/operations-api-token,readonly --mount type=bind,src=$config/checkout-client-pubkey,dst=/run/bitcoinwalk-config/checkout-client-pubkey,readonly --mount type=bind,src=$config/journal-pin.json,dst=/run/bitcoinwalk-config/journal-pin.json,readonly --mount type=bind,src=$config/host-evidence.json,dst=/run/bitcoinwalk-config/host-evidence.json,readonly --mount type=bind,src=$config/operation-cities.json,dst=/run/bitcoinwalk-config/operation-cities.json,readonly --mount type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout --mount type=bind,src=$socket,dst=/run/bitcoinwalk-payout-evidence/socket"
trap 'rm -f "$preflight_mode"' EXIT HUP INT TERM
# shellcheck disable=SC2086
result=$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 $common --mount "type=bind,src=$candidate,dst=/run/bitcoinwalk-config/operation.json,readonly" --mount "type=bind,src=$preflight_mode,dst=/run/bitcoinwalk-config/payout-mode,readonly" --env PAYOUT_PREFLIGHT=1 "$image")||fail
case "$result" in RUSTRESS_PAYOUT_OPERATION_PREFLIGHT_OK\ expiresAt=[0-9]*\ cities=1) expires=${result#*expiresAt=};expires=${expires%% *};;*) fail;;esac
now=$(date -u +%s);remaining=$((expires-now));[ "$remaining" -ge 604800 ]&&[ "$remaining" -le 2592000 ]||fail
rm -f "$preflight_mode";trap - EXIT HUP INT TERM
current=$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')
case "$current" in
 '0.2.14|invoice-only|host|running') ! docker container inspect "$parked" >/dev/null 2>&1||fail;docker stop "$service" >/dev/null;docker rename "$service" "$parked";;
 '0.2.14|operation|host|running') docker container inspect "$parked" >/dev/null 2>&1||fail;docker rm -f "$service" >/dev/null;;
 *) fail;;
esac
previous="$config/operation.previous.json";active="$config/operation.json";rm -f "$previous";[ ! -e "$active" ]||mv "$active" "$previous";cp "$candidate" "$active";chmod 600 "$active";write_mode operation
schedule="$HOME/.config/systemd/user/$expiry_unit.timer.d/schedule.conf"
rollback(){ trap - EXIT HUP INT TERM;systemctl --user disable --now "$expiry_unit.timer" >/dev/null 2>&1||true;docker rm -f "$service" >/dev/null 2>&1||true;rm -f "$socket/evidence.sock" "$schedule";rm -f "$active";[ ! -f "$previous" ]||mv "$previous" "$active";start_invoice||true;fail; }
trap rollback EXIT HUP INT TERM
mounts="$common --mount type=bind,src=$active,dst=/run/bitcoinwalk-config/operation.json,readonly --mount type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly"
# shellcheck disable=SC2086
docker run -d --name "$service" --restart unless-stopped --network host --label org.bitcoinwalk.service=rustress-payout --label org.bitcoinwalk.mode=operation --label org.bitcoinwalk.version="$version" --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.5 $mounts --env NODE_ENV=production "$image" >/dev/null||rollback
mkdir -p "$(dirname "$schedule")";printf '%s\n' '[Timer]' 'OnCalendar=' "OnCalendar=@$expires" 'Persistent=true' 'AccuracySec=5s'>"$schedule";chmod 600 "$schedule";systemctl --user daemon-reload||rollback
systemctl --user enable --now "$expiry_unit.timer" >/dev/null||rollback
[ "$(systemctl --user is-active "$expiry_unit.timer" 2>/dev/null)" = active ]||rollback
ready=0;i=0;while [ "$i" -lt 30 ];do if docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null 2>&1;then ready=1;break;fi;i=$((i+1));sleep 3;done
[ "$ready" -eq 1 ]||rollback
rm -f "$previous" "$candidate";trap - EXIT HUP INT TERM
printf '%s\n' "Rustress payout operation is active for Madeira until epoch $expires; invoice-only rollback is parked."
