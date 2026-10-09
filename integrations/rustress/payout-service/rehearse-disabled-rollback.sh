#!/bin/sh
set -eu

service=bitcoinwalk-rustress-payout
candidate="$service:0.2.4"
previous="$service:0.2.3"
parked="$service-forward-rehearsal"
root="$HOME/.local/state/bitcoinwalk-rustress"
mode="$root/payout-mode"
nwc="$root/secrets/nwc-uri"
state="$root/payout-service"

fail(){ printf '%s\n' "Disabled payout rollback rehearsal failed." >&2; exit 1; }
[ "$(id -u)" -ne 0 ] && [ "$(id -un)" = bitcoinwalk ] || fail
docker info --format '{{json .SecurityOptions}}' | grep -q '"name=rootless"' || fail
[ "$(tr -d '\n' < "$mode")" = disabled ] || fail
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.4|none|running' ] || fail
docker image inspect "$previous" "$candidate" >/dev/null || fail
docker container inspect "$parked" >/dev/null 2>&1 && fail

cleanup(){
  docker rm -f "$service" >/dev/null 2>&1 || true
  if docker container inspect "$parked" >/dev/null 2>&1; then
    docker rename "$parked" "$service" >/dev/null 2>&1 || true
    docker start "$service" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

docker stop "$service" >/dev/null
before="$(find "$state" -maxdepth 1 -type f \( -name 'ledger.sqlite' -o -name 'ledger.sqlite-*' \) -print0 | sort -z | xargs -0 sha256sum)"
docker rename "$service" "$parked"
docker run -d --name "$service" --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
  --mount "type=bind,src=$nwc,dst=/run/bitcoinwalk-secrets/nwc-uri,readonly" \
  --mount "type=bind,src=$mode,dst=/run/bitcoinwalk-config/payout-mode,readonly" \
  --mount "type=bind,src=$state,dst=/var/lib/bitcoinwalk-payout" \
  --env NODE_ENV=production "$previous" >/dev/null
i=0
while [ "$i" -lt 20 ]; do
  if [ "$(docker inspect "$service" --format '{{.State.Status}}|{{.HostConfig.NetworkMode}}')" = 'running|none' ]; then break; fi
  i=$((i+1)); sleep 1
done
[ "$(docker inspect "$service" --format '{{.State.Status}}|{{.HostConfig.NetworkMode}}')" = 'running|none' ] || fail
docker rm -f "$service" >/dev/null
after="$(find "$state" -maxdepth 1 -type f \( -name 'ledger.sqlite' -o -name 'ledger.sqlite-*' \) -print0 | sort -z | xargs -0 sha256sum)"
[ "$before" = "$after" ] || fail
docker rename "$parked" "$service"
docker start "$service" >/dev/null
trap - EXIT HUP INT TERM
i=0
while [ "$i" -lt 20 ]; do
  if docker exec "$service" node /app/verify-rustress-payout-service.cjs >/dev/null 2>&1; then break; fi
  i=$((i+1)); sleep 1
done
docker exec "$service" node /app/verify-rustress-payout-service.cjs >/dev/null 2>&1 || fail
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.4|none|running' ] || fail
printf '%s\n' 'RUSTRESS_PAYOUT_DISABLED_ROLLBACK_REHEARSAL_OK'
