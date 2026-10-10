#!/bin/sh
set -eu
service=bitcoinwalk-rustress-payout;parked="$service-invoice-only-rollback";root="$HOME/.local/state/bitcoinwalk-rustress";mode=$(tr -d '\n'<"$root/payout-mode")
case "$mode" in
 invoice-only) [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.14|invoice-only|host|running' ]&& ! docker container inspect "$parked" >/dev/null 2>&1;;
 operation) [ "$(docker inspect "$service" --format '{{index .Config.Labels "org.bitcoinwalk.version"}}|{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = '0.2.14|operation|host|running' ]&&docker container inspect "$parked" >/dev/null 2>&1&&[ "$(systemctl --user is-active bitcoinwalk-payout-operation-expiry.timer)" = active ]&&docker exec "$service" node /app/verify-rustress-payout-active.cjs >/dev/null;;
 *) exit 1;;
esac
