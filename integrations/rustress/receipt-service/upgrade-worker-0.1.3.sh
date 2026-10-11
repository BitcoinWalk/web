#!/bin/sh
set -eu
[ "$(id -un)" = bitcoinwalk ]&&[ "$(id -u)" -ne 0 ]||exit 1
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
service=bitcoinwalk-rustress-receipt-worker
old_version=0.1.2
version=0.1.3
image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-rustress/receipt-service"
runtime_socket="${XDG_RUNTIME_DIR:?}/bitcoinwalk-rustress-receipt-worker"
rollback="$service-rollback-$version"
fail(){
 docker rm -f "$service" >/dev/null 2>&1||true
 if docker container inspect "$rollback" >/dev/null 2>&1;then docker rename "$rollback" "$service";docker start "$service" >/dev/null 2>&1||true;fi
 printf '%s\n' "Receipt worker upgrade failed; previous worker restored." >&2
 exit 1
}
cd "$here"
sha256sum -c SHA256SUMS
docker info --format '{{json .SecurityOptions}}'|grep -q '"name=rootless"'||exit 1
[ "$(cat "$root/receipt-mode")" = armed ]||exit 1
[ "$(docker container inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.Status}}')" = "$old_version|none|unless-stopped|running" ]||exit 1
docker exec "$service" node /app/verify-rustress-receipt-worker.cjs armed >/dev/null
for companion in bitcoinwalk-rustress-receipt-signer bitcoinwalk-rustress-receipt-relay-egress;do [ "$(docker container inspect "$companion" --format '{{.State.Status}}')" = running ]||exit 1;done
docker build --pull=false --network=none -f Dockerfile.worker --label "org.bitcoinwalk.version=$version" -t "$image" . >/dev/null
docker stop "$service" >/dev/null
docker rename "$service" "$rollback"
common='--restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 48 --memory 192m --cpus 0.25 --user 0:0'
# shellcheck disable=SC2086
docker run -d --name "$service" $common --network none --label org.bitcoinwalk.service=rustress-receipt-worker --label org.bitcoinwalk.mode=armed --label "org.bitcoinwalk.version=$version" --mount "type=bind,src=$root/worker,dst=/var/lib/bitcoinwalk-receipt-worker" --mount "type=bind,src=$runtime_socket,dst=/run/bitcoinwalk-receipt-worker/socket" --mount "type=bind,src=$root/signer-socket,dst=/run/bitcoinwalk-receipt-signer/socket" --mount "type=bind,src=$root/egress-socket,dst=/run/bitcoinwalk-receipt-egress/socket" --mount "type=bind,src=$HOME/.local/state/bitcoinwalk-rustress/payout-evidence-socket,dst=/run/bitcoinwalk-payout-evidence/socket" --mount "type=bind,src=$root/receipt-mode,dst=/run/bitcoinwalk-receipt-worker/config/receipt-mode,readonly" --mount "type=bind,src=$root/config/provider-pubkey,dst=/run/bitcoinwalk-receipt-worker/config/provider-pubkey,readonly" --mount "type=bind,src=$root/secrets/receipt-evidence-token,dst=/run/bitcoinwalk-receipt-worker/secrets/receipt-evidence-token,readonly" --mount "type=bind,src=$root/secrets/signer-api-token,dst=/run/bitcoinwalk-receipt-worker/secrets/signer-api-token,readonly" --mount "type=bind,src=$root/secrets/claim-api-token,dst=/run/bitcoinwalk-receipt-worker/secrets/claim-api-token,readonly" --mount "type=bind,src=$root/secrets/relay-egress-api-token,dst=/run/bitcoinwalk-receipt-worker/secrets/relay-egress-api-token,readonly" "$image" >/dev/null||fail
i=0
until docker exec "$service" node /app/verify-rustress-receipt-worker.cjs armed >/dev/null 2>&1;do i=$((i+1));[ "$i" -lt 20 ]||fail;sleep 1;done
[ "$(docker container inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.Status}}')" = "$version|armed|none|unless-stopped|running" ]||fail
systemctl --user is-active --quiet bitcoinwalk-rustress-managed.service||fail
systemctl --user is-active --quiet bitcoinwalk-rustress-receipt-proxy.socket||fail
docker rm "$rollback" >/dev/null
printf '%s\n' "Receipt worker $version is active; longer NIP-57 relay lists are accepted within the fixed egress policy."
