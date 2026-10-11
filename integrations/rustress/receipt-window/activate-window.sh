#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
fail(){ printf '%s\n' "Receipt window activation failed; rollback attempted." >&2;"$here/rollback-window.sh" >/dev/null 2>&1||true;exit 1; }
[ "$#" -eq 3 ]||exit 1
[ "$(id -un)" = bitcoinwalk ]&&[ "$(id -u)" -ne 0 ]||exit 1
city="$1";maximum="$2";duration="$3"
if [ "$city" = all-active-cities ];then city='*';else echo "$city"|grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'||exit 1;fi
echo "$maximum"|grep -Eq '^[1-9][0-9]{3,9}$'||exit 1
[ "$maximum" -le 100000 ]&&[ "$duration" -ge 300 ]&&[ "$duration" -le 900 ]||exit 1
version=0.1.2;root="$HOME/.local/state/bitcoinwalk-rustress/receipt-service";window="$root/window";unit="$HOME/.config/systemd/user/bitcoinwalk-rustress-managed.service"
runtime_socket="${XDG_RUNTIME_DIR:?}/bitcoinwalk-rustress-receipt-worker"
worker=bitcoinwalk-rustress-receipt-worker;signer=bitcoinwalk-rustress-receipt-signer;egress=bitcoinwalk-rustress-receipt-relay-egress;baseline="$worker-window-baseline"
docker info --format '{{json .SecurityOptions}}'|grep -q '"name=rootless"'||exit 1
[ ! -e "$window" ]||exit 1;mkdir -m 700 "$window";cp "$unit" "$window/unit.before";chmod 600 "$window/unit.before"
[ "$(docker container inspect "$worker" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = "$version|disabled|none|running" ]||fail
for name in "$signer" "$egress" "$baseline";do ! docker container inspect "$name" >/dev/null 2>&1||fail;done
mkdir -p "$runtime_socket" "$root/signer-socket" "$root/egress-socket";chmod 700 "$runtime_socket" "$root/signer-socket" "$root/egress-socket"
for name in signer-api-token claim-api-token relay-egress-api-token;do path="$root/secrets/$name";if [ ! -e "$path" ];then umask 077;python3 -c 'import secrets;print(secrets.token_urlsafe(48))' >"$path";fi;chmod 600 "$path";done
install -m 600 "$HOME/.local/state/bitcoinwalk-rustress/secrets/receipt-api-token" "$root/secrets/receipt-evidence-token"
python3 - "$root/secrets" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]);values=[]
for name in ('receipt-evidence-token','signer-api-token','claim-api-token','relay-egress-api-token'):
 v=(p/name).read_text().strip();assert re.fullmatch(r'[A-Za-z0-9_-]{43,256}',v);values.append(v)
assert len(set(values))==4
PY
cmp -s "$root/config/relay-allowlist.json" "$here/relay-allowlist.json"||fail
docker stop "$worker" >/dev/null;docker rename "$worker" "$baseline";printf '%s\n' armed >"$root/receipt-mode";chmod 600 "$root/receipt-mode"
common='--restart no --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 48 --memory 192m --cpus 0.25 --user 0:0'
# shellcheck disable=SC2086
docker run -d --name "$signer" $common --network none --mount "type=bind,src=$root/signer,dst=/var/lib/bitcoinwalk-receipt-signer" --mount "type=bind,src=$root/signer-socket,dst=/run/bitcoinwalk-receipt-signer/socket" --mount "type=bind,src=$root/secrets/provider-secret-key,dst=/run/bitcoinwalk-receipt-signer/secrets/provider-secret-key,readonly" --mount "type=bind,src=$root/secrets/signer-api-token,dst=/run/bitcoinwalk-receipt-signer/secrets/signer-api-token,readonly" --mount "type=bind,src=$root/config/provider-pubkey,dst=/run/bitcoinwalk-receipt-signer/config/provider-pubkey,readonly" "bitcoinwalk-rustress-receipt-signer:$version" >/dev/null||fail
# shellcheck disable=SC2086
docker run -d --name "$egress" $common --network bridge --mount "type=bind,src=$root/egress-socket,dst=/run/bitcoinwalk-receipt-egress/socket" --mount "type=bind,src=$root/secrets/relay-egress-api-token,dst=/run/bitcoinwalk-receipt-egress/secrets/relay-egress-api-token,readonly" --mount "type=bind,src=$root/config/provider-pubkey,dst=/run/bitcoinwalk-receipt-egress/config/provider-pubkey,readonly" --mount "type=bind,src=$root/config/relay-allowlist.json,dst=/run/bitcoinwalk-receipt-egress/config/relay-allowlist.json,readonly" "bitcoinwalk-rustress-receipt-relay-egress:$version" >/dev/null||fail
# shellcheck disable=SC2086
docker run -d --name "$worker" $common --network none --mount "type=bind,src=$root/worker,dst=/var/lib/bitcoinwalk-receipt-worker" --mount "type=bind,src=$runtime_socket,dst=/run/bitcoinwalk-receipt-worker/socket" --mount "type=bind,src=$root/signer-socket,dst=/run/bitcoinwalk-receipt-signer/socket" --mount "type=bind,src=$root/egress-socket,dst=/run/bitcoinwalk-receipt-egress/socket" --mount "type=bind,src=$HOME/.local/state/bitcoinwalk-rustress/payout-evidence-socket,dst=/run/bitcoinwalk-payout-evidence/socket" --mount "type=bind,src=$root/receipt-mode,dst=/run/bitcoinwalk-receipt-worker/config/receipt-mode,readonly" --mount "type=bind,src=$root/config/provider-pubkey,dst=/run/bitcoinwalk-receipt-worker/config/provider-pubkey,readonly" --mount "type=bind,src=$root/secrets/receipt-evidence-token,dst=/run/bitcoinwalk-receipt-worker/secrets/receipt-evidence-token,readonly" --mount "type=bind,src=$root/secrets/signer-api-token,dst=/run/bitcoinwalk-receipt-worker/secrets/signer-api-token,readonly" --mount "type=bind,src=$root/secrets/claim-api-token,dst=/run/bitcoinwalk-receipt-worker/secrets/claim-api-token,readonly" --mount "type=bind,src=$root/secrets/relay-egress-api-token,dst=/run/bitcoinwalk-receipt-worker/secrets/relay-egress-api-token,readonly" "bitcoinwalk-rustress-receipt-worker:$version" >/dev/null||fail
i=0;until docker exec "$worker" node /app/verify-rustress-receipt-worker.cjs armed >/dev/null 2>&1;do i=$((i+1));[ "$i" -lt 20 ]||fail;sleep 1;done
"$here/configure-provider.py" "$unit" "$root/secrets/claim-api-token" "$city" "$maximum" "$runtime_socket/intake.sock"||fail
systemctl --user daemon-reload;systemctl --user restart bitcoinwalk-rustress-managed.service||fail;systemctl --user is-active --quiet bitcoinwalk-rustress-managed.service||fail
systemd-run --user --unit=bitcoinwalk-receipt-window-rollback --on-active="${duration}s" --property=Type=oneshot "$here/rollback-window.sh" >/dev/null||fail
printf '%s\n' "RECEIPT_WINDOW_ACTIVE city=$city maximum_msat=$maximum duration_seconds=$duration automatic_rollback=yes"
