#!/bin/sh
set -eu

service=bitcoinwalk-rustress-payout
version=0.2.5
image="$service:$version"
root="$HOME/.local/state/bitcoinwalk-rustress"
secrets="$root/secrets"
state="$root/payout-service"
mode="$root/payout-mode"
evidence_socket="$root/payout-evidence-socket"
nwc="$secrets/nwc-uri"
monitor="$HOME/.local/libexec/bitcoinwalk-payout-backup/monitor-payout-state.sh"
monitor_previous="$monitor.previous-0.2.1"

fail(){ printf '%s\n' "Payout service installation failed." >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || fail
[ "$(id -un)" = bitcoinwalk ] || fail
docker info --format '{{json .SecurityOptions}}' | grep -q '"name=rootless"' || fail
[ -f SHA256SUMS ] && [ ! -L SHA256SUMS ] || fail
sha256sum -c SHA256SUMS
[ -x "$HOME/.local/libexec/bitcoinwalk-rustress/check-nwc-secret.sh" ] || fail
"$HOME/.local/libexec/bitcoinwalk-rustress/check-nwc-secret.sh" >/dev/null

mkdir -p "$state"; chmod 700 "$state"
[ -d "$state" ] && [ ! -L "$state" ] || fail
[ "$(stat -c '%U:%G:%a' "$state")" = "bitcoinwalk:bitcoinwalk:700" ] || fail
mkdir -p "$evidence_socket";chmod 700 "$evidence_socket"
[ -d "$evidence_socket" ] && [ ! -L "$evidence_socket" ] && [ "$(stat -c '%U:%G:%a' "$evidence_socket")" = "bitcoinwalk:bitcoinwalk:700" ] || fail
[ ! -e "$evidence_socket/evidence.sock" ] || fail
if [ ! -e "$mode" ]; then umask 077; printf '%s\n' disabled > "$mode"; fi
[ -f "$mode" ] && [ ! -L "$mode" ] || fail
[ "$(stat -c '%U:%G:%a:%s' "$mode")" = "bitcoinwalk:bitcoinwalk:600:9" ] || fail
[ "$(tr -d '\n' < "$mode")" = disabled ] || fail
[ -d "$secrets" ] && [ ! -L "$secrets" ] && [ "$(stat -c '%U:%G:%a' "$secrets")" = "bitcoinwalk:bitcoinwalk:700" ] || fail
receipt="$secrets/receipt-api-token"
if [ ! -e "$receipt" ]; then
  temporary="$secrets/.receipt-api-token.$$";trap 'rm -f "$temporary"' EXIT HUP INT TERM
  umask 077;openssl rand -base64 48 | tr '+/' '-_' | tr -d '\n' > "$temporary";printf '\n' >> "$temporary";chmod 600 "$temporary";mv "$temporary" "$receipt";trap - EXIT HUP INT TERM
fi
[ -f "$receipt" ] && [ ! -L "$receipt" ] && [ "$(stat -c '%U:%G:%a' "$receipt")" = "bitcoinwalk:bitcoinwalk:600" ] || fail
grep -Eq '^[A-Za-z0-9_-]{43,256}$' "$receipt" || fail

if docker container inspect "$service" >/dev/null 2>&1; then
  [ "$(docker container inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.service"}}')" = rustress-payout ] || fail
fi

docker build --pull=false --network=none --label "org.bitcoinwalk.version=$version" -t "$image" . >/dev/null
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
  --mount "type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout" --entrypoint node "$image" /app/initialize-rustress-payout-ledger.cjs | grep -qx RUSTRESS_PAYOUT_LEDGER_INITIALIZED || fail
old=""
if docker container inspect "$service" >/dev/null 2>&1; then
  old="$service-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
  docker stop "$service" >/dev/null
  docker rename "$service" "$old"
fi
rollback(){
  docker rm -f "$service" >/dev/null 2>&1 || true
  if [ -n "$old" ]; then docker rename "$old" "$service"; docker start "$service" >/dev/null; fi
  if [ -f "$monitor_previous" ]; then cp "$monitor_previous" "$monitor"; chmod 700 "$monitor"; rm -f "$monitor_previous"; fi
  fail
}
docker run -d --name "$service" --restart unless-stopped --network none \
  --label org.bitcoinwalk.service=rustress-payout --label org.bitcoinwalk.mode=disabled --label "org.bitcoinwalk.version=$version" \
  --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
  --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.25 \
  --mount "type=bind,src=$nwc,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly" \
  --mount "type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly" \
  --mount "type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout" \
  --env NODE_ENV=production "$image" >/dev/null || rollback

ready=0;i=0
while [ "$i" -lt 20 ]; do
  if docker exec "$service" node /app/verify-rustress-payout-service.cjs >/dev/null 2>&1; then ready=1; break; fi
  i=$((i+1)); sleep 2
done
[ "$ready" -eq 1 ] || rollback

[ "$(docker container inspect "$service" --format '{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.Privileged}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}|{{.HostConfig.RestartPolicy.Name}}')" = 'none|true|false|["ALL"]|["no-new-privileges:true"]|unless-stopped' ] || rollback
[ "$(docker container inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{index .Config.Labels "org.bitcoinwalk.version"}}')" = "disabled|$version" ] || rollback
docker exec "$service" test -r /app/backup-sqlite-online.mjs || rollback
[ "$(docker exec "$service" awk '/^Uid:/{print $2":"$3":"$4":"$5} /^CapEff:/{print $2}' /proc/1/status)" = '0:0:0:0
0000000000000000' ] || rollback
[ -f "$monitor" ] && [ ! -L "$monitor" ] && [ "$(stat -c '%U:%G:%a' "$monitor")" = "bitcoinwalk:bitcoinwalk:700" ] || rollback
[ ! -e "$monitor_previous" ] || rollback
cp "$monitor" "$monitor_previous" || rollback
chmod 700 "$monitor_previous" || rollback
cp monitor-payout-state.sh "$monitor" || rollback
chmod 700 "$monitor" || rollback
"$monitor" ledger || rollback
if [ -n "$old" ]; then docker rm "$old" >/dev/null; fi
printf '%s\n' "Rustress payout service $version is running safely disabled in rootless Docker."
