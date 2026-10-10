#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout;previous="$service-previous-0.2.13";version=0.2.14;image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-rustress";state="$root/payout-service";secrets="$root/secrets";config="$root/payout-config";mode="$root/payout-mode"
libexec="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation";units="$HOME/.config/systemd/user";lock="$root/payout-operation.lock"
fail(){ printf '%s\n' 'Payout operation installation failed; the prior invoice-only service was restored when possible.' >&2;exit 1; }
write_mode(){ temporary="$root/.payout-mode.$$";printf '%s\n' "$1">"$temporary";chmod 600 "$temporary";mv "$temporary" "$mode"; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
umask 077;exec 9>"$lock";chmod 600 "$lock";flock -n 9||fail
sha256sum -c SHA256SUMS >/dev/null||fail
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.13|invoice-only|host|running' ]||fail
[ "$(tr -d '\n'<"$mode")" = invoice-only ]||fail
for name in nwc-uri intake-api-token issuer-api-token receipt-api-token authority-api-token operations-api-token;do path="$secrets/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
path="$config/checkout-client-pubkey";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail
docker image inspect bitcoinwalk-rustress-payout:0.2.13 >/dev/null||fail
docker build --pull=false --network=none -t "$image" . >/dev/null||fail
mkdir -p "$libexec" "$units";chmod 700 "$libexec";install -m 700 start-operation.sh "$libexec/start.sh";install -m 700 restore-invoice-only.sh "$libexec/restore.sh";install -m 700 monitor-operation.sh "$libexec/monitor.sh"
install -m 600 bitcoinwalk-payout-operation-expiry.service bitcoinwalk-payout-operation-expiry.timer bitcoinwalk-payout-operation-monitor.service bitcoinwalk-payout-operation-monitor.timer "$units/"
systemctl --user daemon-reload||fail
install -m 600 operation-cities.json "$config/operation-cities.json"
! docker container inspect "$previous" >/dev/null 2>&1||fail
rollback(){ docker rm -f "$service" >/dev/null 2>&1||true;write_mode invoice-only;if docker container inspect "$previous" >/dev/null 2>&1;then docker rename "$previous" "$service"&&docker start "$service" >/dev/null||true;fi;fail; }
docker stop "$service" >/dev/null;docker rename "$service" "$previous";trap rollback EXIT HUP INT TERM
write_mode invoice-only
mounts="--mount type=bind,src=$secrets/nwc-uri,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly --mount type=bind,src=$secrets/intake-api-token,dst=/run/bitcoinwalk-secrets/intake-api-token,readonly --mount type=bind,src=$secrets/issuer-api-token,dst=/run/bitcoinwalk-secrets/issuer-api-token,readonly --mount type=bind,src=$secrets/receipt-api-token,dst=/run/bitcoinwalk-secrets/receipt-api-token,readonly --mount type=bind,src=$secrets/authority-api-token,dst=/run/bitcoinwalk-secrets/authority-api-token,readonly --mount type=bind,src=$secrets/operations-api-token,dst=/run/bitcoinwalk-secrets/operations-api-token,readonly --mount type=bind,src=$config/checkout-client-pubkey,dst=/run/bitcoinwalk-config/checkout-client-pubkey,readonly --mount type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly --mount type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout"
# shellcheck disable=SC2086
docker run -d --name "$service" --restart unless-stopped --network host --label org.bitcoinwalk.service=rustress-payout --label org.bitcoinwalk.mode=invoice-only --label org.bitcoinwalk.version="$version" --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.25 $mounts --env NODE_ENV=production "$image" >/dev/null||rollback
ready=0;i=0;while [ "$i" -lt 30 ];do if curl -fsS --max-time 3 http://127.0.0.1:8893/health >/dev/null 2>&1;then ready=1;break;fi;i=$((i+1));sleep 2;done
[ "$ready" -eq 1 ]&&[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.14|invoice-only|host|running' ]||rollback
systemctl --user enable --now bitcoinwalk-payout-operation-monitor.timer >/dev/null||rollback;docker rm "$previous" >/dev/null||rollback;trap - EXIT HUP INT TERM
printf '%s\n' 'Rustress payout 0.2.14 is installed in invoice-only mode. No city payout operation is active.'
