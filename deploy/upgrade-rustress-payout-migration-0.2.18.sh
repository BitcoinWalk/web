#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout
parked="$service-invoice-only-rollback"
rollback_container="$service-operation-rollback-0.2.17"
version=0.2.18
image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-rustress"
state="$root/payout-service"
secrets="$root/secrets"
config="$root/payout-config"
mode="$root/payout-mode"
socket="$root/payout-evidence-socket"
lock="$root/payout-operation.lock"
monitor="$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/monitor.sh"
fail(){ printf '%s\n' 'Payout 0.2.18 upgrade failed; the prior operation service was restored when possible.' >&2;exit 1; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
umask 077;exec 9>"$lock";chmod 600 "$lock";flock -w 90 9||fail
sha256sum -c SHA256SUMS >/dev/null||fail
[ "$(tr -d '\n'<"$mode")" = operation ]||fail
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.17|operation|host|running' ]||fail
[ "$(docker inspect "$parked" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.16|invoice-only|host|exited' ]||fail
! docker container inspect "$rollback_container" >/dev/null 2>&1||fail
for name in nwc-uri journal-client-token intake-api-token issuer-api-token receipt-api-token authority-api-token operations-api-token;do path="$secrets/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
for name in checkout-client-pubkey journal-pin.json host-evidence.json operation.json;do path="$config/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
[ -d "$state" ]&&[ ! -L "$state" ]&&[ "$(stat -c '%U:%G:%a' "$state")" = bitcoinwalk:bitcoinwalk:700 ]||fail
[ -d "$socket" ]&&[ ! -L "$socket" ]&&[ "$(stat -c '%U:%G:%a' "$socket")" = bitcoinwalk:bitcoinwalk:700 ]||fail
docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null||fail
backup=$(mktemp -d "$HOME/backups/rustress-payout-migration-0.2.18.XXXXXX");chmod 700 "$backup"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
 --mount "type=bind,src=$state,dst=/source,readonly" --mount "type=bind,src=$backup,dst=/backup" \
 --entrypoint node bitcoinwalk-rustress-payout:0.2.17 /app/backup-sqlite-online.mjs /source/ledger.sqlite /backup/ledger.sqlite||fail
cp -p "$config/host-evidence.json" "$backup/host-evidence.json"||fail
cp -p "$monitor" "$backup/monitor.sh"||fail
docker build --pull=false --network=none -f rustress-payout-migration-0.2.18.Dockerfile -t "$image" . >/dev/null||fail
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
 --mount "type=bind,src=$backup,dst=/var/lib/bitcoinwalk-payout" --entrypoint node "$image" /app/migrate-london-payout-v5-to-v6.cjs \
 |grep -qx 'LONDON_PAYOUT_MIGRATION_RECORDED amountMsat=165900 sourceOutstandingMsat=0 targetAvailableMsat=166490'||fail
docker stop "$service" >/dev/null||fail
docker rename "$service" "$rollback_container"||fail
rollback(){
 trap - EXIT HUP INT TERM
 docker rm -f "$service" >/dev/null 2>&1||true
 rm -f "$socket/evidence.sock"
 cp -p "$backup/host-evidence.json" "$config/host-evidence.json"||true
 cp -p "$backup/monitor.sh" "$monitor"||true
 if docker container inspect "$rollback_container" >/dev/null 2>&1;then docker rename "$rollback_container" "$service"&&docker start "$service" >/dev/null||true;fi
 fail
}
trap rollback EXIT HUP INT TERM
mounts="--mount type=bind,src=$secrets/nwc-uri,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly --mount type=bind,src=$secrets/journal-client-token,dst=/run/bitcoinwalk-secrets/journal-client-token,readonly --mount type=bind,src=$secrets/intake-api-token,dst=/run/bitcoinwalk-secrets/intake-api-token,readonly --mount type=bind,src=$secrets/issuer-api-token,dst=/run/bitcoinwalk-secrets/issuer-api-token,readonly --mount type=bind,src=$secrets/receipt-api-token,dst=/run/bitcoinwalk-secrets/receipt-api-token,readonly --mount type=bind,src=$secrets/authority-api-token,dst=/run/bitcoinwalk-secrets/authority-api-token,readonly --mount type=bind,src=$secrets/operations-api-token,dst=/run/bitcoinwalk-secrets/operations-api-token,readonly --mount type=bind,src=$config/checkout-client-pubkey,dst=/run/bitcoinwalk-config/checkout-client-pubkey,readonly --mount type=bind,src=$config/journal-pin.json,dst=/run/bitcoinwalk-config/journal-pin.json,readonly --mount type=bind,src=$config/host-evidence.json,dst=/run/bitcoinwalk-config/host-evidence.json,readonly --mount type=bind,src=$config/operation.json,dst=/run/bitcoinwalk-config/operation.json,readonly --mount type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly --mount type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout --mount type=bind,src=$socket,dst=/run/bitcoinwalk-payout-evidence/socket"
# shellcheck disable=SC2086
docker run -d --name "$service" --restart unless-stopped --network host --label org.bitcoinwalk.service=rustress-payout --label org.bitcoinwalk.mode=operation --label org.bitcoinwalk.version="$version" --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.5 $mounts --env NODE_ENV=production "$image" >/dev/null||rollback
./refresh-host-evidence.py --restore-rehearsal-verified ledger-and-journal --release "$version" --service-mode operation >/dev/null||rollback
ready=0;i=0
while [ "$i" -lt 30 ];do if docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null 2>&1;then ready=1;break;fi;i=$((i+1));sleep 3;done
[ "$ready" -eq 1 ]||rollback
install -m 700 monitor-rustress-payout-0.2.18.sh "$monitor"||rollback
systemctl --user reset-failed bitcoinwalk-payout-operation-monitor.service >/dev/null 2>&1||true
systemctl --user start bitcoinwalk-payout-operation-monitor.service||rollback
docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null||rollback
docker rm "$rollback_container" >/dev/null||rollback
trap - EXIT HUP INT TERM
printf '%s\n' "Rustress payout $version is active. Ledger backup: $backup"
