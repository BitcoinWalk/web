#!/bin/sh
set -eu

service=bitcoinwalk-rustress-wallet-shadow
version=0.1.1
image="$service:$version"
state="$HOME/.local/state/bitcoinwalk-rustress/secrets"
nwc="$state/nwc-uri"
token="$state/shadow-api-token"

fail(){ printf '%s\n' "Wallet shadow installation failed." >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || fail
[ "$(id -un)" = bitcoinwalk ] || fail
docker info --format '{{json .SecurityOptions}}' | grep -q '"name=rootless"' || fail
[ -f SHA256SUMS ] && [ ! -L SHA256SUMS ] || fail
sha256sum -c SHA256SUMS
[ -x "$HOME/.local/libexec/bitcoinwalk-rustress/check-nwc-secret.sh" ] || fail
"$HOME/.local/libexec/bitcoinwalk-rustress/check-nwc-secret.sh" >/dev/null
mkdir -p "$state"; chmod 700 "$state"
if [ ! -e "$token" ]; then
  tmp="$state/.shadow-api-token.$$"
  trap 'rm -f "$tmp"' EXIT HUP INT TERM
  umask 077; openssl rand -hex 32 > "$tmp"; chmod 600 "$tmp"; mv "$tmp" "$token"
  trap - EXIT HUP INT TERM
fi
[ -f "$token" ] && [ ! -L "$token" ] || fail
[ "$(stat -c '%U:%G:%a:%s' "$token")" = "bitcoinwalk:bitcoinwalk:600:65" ] || fail

if docker container inspect "$service" >/dev/null 2>&1; then
  [ "$(docker container inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.service"}}')" = rustress-wallet-shadow ] || fail
fi

docker build --pull=false --network=none --label "org.bitcoinwalk.version=$version" -f Dockerfile.shadow -t "$image" . >/dev/null
old=""
if docker container inspect "$service" >/dev/null 2>&1; then
  old="$service-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
  docker stop "$service" >/dev/null
  docker rename "$service" "$old"
fi
rollback(){
  docker rm -f "$service" >/dev/null 2>&1 || true
  if [ -n "$old" ]; then docker rename "$old" "$service"; docker start "$service" >/dev/null; fi
  fail
}
docker run -d --name "$service" --restart unless-stopped \
  --label org.bitcoinwalk.service=rustress-wallet-shadow --label "org.bitcoinwalk.version=$version" \
  --user 0:0 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges:true --pids-limit 64 --memory 256m --cpus 0.25 \
  --publish 127.0.0.1:8892:8892 \
  --mount "type=bind,src=$nwc,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly" \
  --mount "type=bind,src=$token,dst=/run/bitcoinwalk-secrets/shadow-api-token,readonly" \
  --env NODE_ENV=production --env SHADOW_PROBE_INTERVAL_MS=300000 \
  "$image" >/dev/null || rollback

ready=0
i=0
while [ "$i" -lt 20 ]; do
  if docker exec "$service" node /app/verify-rustress-wallet-shadow.cjs >/dev/null 2>&1; then ready=1; break; fi
  i=$((i+1)); sleep 3
done
[ "$ready" -eq 1 ] || rollback

[ "$(docker container inspect "$service" --format '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.Privileged}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}|{{(index (index .NetworkSettings.Ports "8892/tcp") 0).HostIp}}')" = '0:0|true|false|["ALL"]|["no-new-privileges:true"]|127.0.0.1' ] || rollback
caps=$(docker container inspect "$service" --format '{{json .HostConfig.CapAdd}}')
printf '%s' "$caps" | grep -q '"CAP_SETUID"' || rollback
printf '%s' "$caps" | grep -q '"CAP_SETGID"' || rollback
[ "$(docker container inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{index .Config.Labels "org.bitcoinwalk.version"}}')" = "read-only|$version" ] || rollback
[ "$(docker exec "$service" awk '/^Uid:/{print $2":"$3":"$4":"$5} /^Gid:/{print $2":"$3":"$4":"$5} /^CapEff:/{print $2}' /proc/1/status)" = '1004:1004:1004:1004
1004:1004:1004:1004
0000000000000000' ] || rollback
if [ -n "$old" ]; then docker rm "$old" >/dev/null; fi
printf '%s\n' "Rustress wallet shadow $version is active on 127.0.0.1:8892. Invoice issuance and payouts are disabled."
