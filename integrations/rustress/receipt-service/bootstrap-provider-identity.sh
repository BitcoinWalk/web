#!/bin/sh
set -eu
service=bitcoinwalk-rustress-receipt;version=0.1.0;worker="$service-worker";signer="$service-signer";image="$signer:$version"
root="$HOME/.local/state/bitcoinwalk-rustress/receipt-service";mode="$root/receipt-mode";secrets="$root/secrets";config="$root/config";state="$root/signer"
fail(){ printf '%s\n' "Receipt provider identity bootstrap refused." >&2;exit 1; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
docker info --format '{{json .SecurityOptions}}'|grep -q '"name=rootless"'||fail
[ "$(docker inspect "$worker" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = "$version|disabled|none|running" ]||fail
docker container inspect "$signer" >/dev/null 2>&1&&fail
docker image inspect "$image" >/dev/null 2>&1||fail
[ -f "$mode" ]&&[ ! -L "$mode" ]&&[ "$(tr -d '\n'<"$mode")" = disabled ]||fail
for path in "$root" "$state";do [ -d "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:700 ]||fail;done
for path in "$secrets" "$config";do mkdir -p "$path";chmod 700 "$path";[ -d "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:700 ]||fail;done
for path in "$secrets/provider-secret-key" "$config/provider-pubkey" "$state/signer.sqlite";do [ ! -e "$path" ]&&[ ! -L "$path" ]||fail;done
result="$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
 --mount "type=bind,src=$root,dst=/var/lib/bitcoinwalk-receipt-bootstrap" --entrypoint node "$image" /app/initialize-rustress-receipt-identity.cjs)"||fail
printf '%s\n' "$result"|grep -Eq '^RECEIPT_PROVIDER_IDENTITY_CREATED pubkey=[0-9a-f]{64}$'||fail
for path in "$secrets/provider-secret-key" "$config/provider-pubkey" "$state/signer.sqlite";do [ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a:%h' "$path")" = bitcoinwalk:bitcoinwalk:600:1 ]||fail;done
docker container inspect "$signer" >/dev/null 2>&1&&fail
printf '%s\n' "$result"
