#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout
parked="$service-invoice-only-rollback"
root="$HOME/.local/state/bitcoinwalk-rustress"
[ "$(tr -d '\n'<"$root/payout-mode")" = operation ]
[ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.19|operation|host|running' ]
docker container inspect "$parked" >/dev/null
attempt=1
while [ "$attempt" -le 4 ];do
 if docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null 2>&1;then exit 0;fi
 [ "$attempt" -lt 4 ]||exit 1
 attempt=$((attempt+1));sleep 5
done
