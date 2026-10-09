#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout;version=0.2.3;image="$service:$version";root="$HOME/.local/state/bitcoinwalk-rustress";state="$root/payout-service";secrets="$root/secrets";config="$root/payout-config";mode="$root/payout-mode"
fail(){ printf '%s\n' "Payout activation failed; service remains disabled." >&2;exit 1; }
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||fail
docker info --format '{{json .SecurityOptions}}'|grep -q '"name=rootless"'||fail
[ -f "$mode" ]&&[ ! -L "$mode" ]&&[ "$(tr -d '\n'<"$mode")" = disabled ]||fail
for name in nwc-uri journal-client-token intake-api-token issuer-api-token receipt-api-token authority-api-token operations-api-token;do path="$secrets/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
for name in checkout-client-pubkey journal-pin.json host-evidence.json activation.json;do path="$config/$name";[ -f "$path" ]&&[ ! -L "$path" ]&&[ "$(stat -c '%U:%G:%a' "$path")" = bitcoinwalk:bitcoinwalk:600 ]||fail;done
tmp="$root/.payout-mode.$$";trap 'rm -f "$tmp"' EXIT HUP INT TERM;umask 077;printf '%s\n' armed>"$tmp";chmod 600 "$tmp";mv "$tmp" "$mode";trap - EXIT HUP INT TERM
mounts="--mount type=bind,src=$secrets/nwc-uri,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly --mount type=bind,src=$secrets/journal-client-token,dst=/run/bitcoinwalk-secrets/journal-client-token,readonly --mount type=bind,src=$secrets/intake-api-token,dst=/run/bitcoinwalk-secrets/intake-api-token,readonly --mount type=bind,src=$secrets/issuer-api-token,dst=/run/bitcoinwalk-secrets/issuer-api-token,readonly --mount type=bind,src=$secrets/receipt-api-token,dst=/run/bitcoinwalk-secrets/receipt-api-token,readonly --mount type=bind,src=$secrets/authority-api-token,dst=/run/bitcoinwalk-secrets/authority-api-token,readonly --mount type=bind,src=$secrets/operations-api-token,dst=/run/bitcoinwalk-secrets/operations-api-token,readonly --mount type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly --mount type=bind,src=$config/checkout-client-pubkey,dst=/run/bitcoinwalk-config/checkout-client-pubkey,readonly --mount type=bind,src=$config/journal-pin.json,dst=/run/bitcoinwalk-config/journal-pin.json,readonly --mount type=bind,src=$config/host-evidence.json,dst=/run/bitcoinwalk-config/host-evidence.json,readonly --mount type=bind,src=$config/activation.json,dst=/run/bitcoinwalk-config/activation.json,readonly --mount type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout"
# shellcheck disable=SC2086
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 $mounts --env PAYOUT_PREFLIGHT=1 "$image"|grep -qx RUSTRESS_PAYOUT_PREFLIGHT_OK||{ printf '%s\n' disabled>"$mode";fail; }
docker rm -f "$service" >/dev/null 2>&1||true
# shellcheck disable=SC2086
docker run -d --name "$service" --restart unless-stopped --network host --label org.bitcoinwalk.service=rustress-payout --label org.bitcoinwalk.mode=armed --label "org.bitcoinwalk.version=$version" --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.5 $mounts --env NODE_ENV=production "$image" >/dev/null||{ printf '%s\n' disabled>"$mode";fail; }
ready=0;i=0;while [ "$i" -lt 20 ];do if docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null 2>&1;then ready=1;break;fi;i=$((i+1));sleep 3;done
if [ "$ready" -ne 1 ];then docker rm -f "$service" >/dev/null 2>&1||true;printf '%s\n' disabled>"$mode";fail;fi
printf '%s\n' "Rustress payout service $version is active under the signed grant."
