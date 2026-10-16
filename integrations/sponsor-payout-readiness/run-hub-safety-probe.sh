#!/usr/bin/env bash
set -euo pipefail
if (($# != 0)); then exit 64; fi
[[ ${EUID} -ne 0 && $(id -un) == bitcoinwalk ]] || exit 77
service=bitcoinwalk-sponsor-payout
image=bitcoinwalk-sponsor-payout:0.1.1
root=${HOME}/.local/state/bitcoinwalk-sponsor-payout
secret=${root}/secrets/nwc-uri
bundle=${HOME}/.local/libexec/bitcoinwalk-sponsor-payout-readiness/sponsor-payout-hub-safety-probe.cjs
[[ $(docker inspect "${service}" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}') == 'disabled|none|running' ]] || exit 1
"$(dirname "$0")/check-nwc-secret.sh" >/dev/null
[[ -f ${bundle} && ! -L ${bundle} ]] || exit 1
set +e
output=$(docker run --rm --network host --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
  --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 128m --cpus 0.20 \
  --mount "type=bind,src=${secret},dst=/run/secrets/nwc-uri,readonly" \
  --mount "type=bind,src=${bundle},dst=/app/sponsor-payout-hub-safety-probe.cjs,readonly" \
  --entrypoint node "${image}" /app/sponsor-payout-hub-safety-probe.cjs /run/secrets/nwc-uri)
status=$?
set -e
[[ $(docker inspect "${service}" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}') == 'disabled|none|running' ]] || exit 1
printf '%s\n' "${output}"
exit "${status}"
