#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout
parked="$service-invoice-only-rollback"
root="$HOME/.local/state/bitcoinwalk-rustress"
mode=$(tr -d '\n'<"$root/payout-mode")
verify_operation(){
 attempt=1
 while [ "$attempt" -le 4 ];do
  if docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null 2>&1;then return 0;fi
  [ "$attempt" -lt 4 ]||return 1
  attempt=$((attempt+1));sleep 5
 done
}
case "$mode" in
 invoice-only) [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.16|invoice-only|host|running' ]&& ! docker container inspect "$parked" >/dev/null 2>&1;;
 operation) [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.18|operation|host|running' ]&&docker container inspect "$parked" >/dev/null 2>&1&&verify_operation;;
 *) exit 1;;
esac
