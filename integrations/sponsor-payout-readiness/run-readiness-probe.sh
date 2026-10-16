#!/usr/bin/env bash
set -euo pipefail

if (($# != 0)); then exit 64; fi
[[ ${EUID} -ne 0 && $(id -un) == bitcoinwalk ]] || exit 77

service=bitcoinwalk-sponsor-payout
image=bitcoinwalk-sponsor-payout:0.1.0
root=${HOME}/.local/state/bitcoinwalk-sponsor-payout
secret=${root}/secrets/nwc-uri
evidence_dir=${root}/readiness
evidence=${evidence_dir}/nwc-readiness.json
bundle=${HOME}/.local/libexec/bitcoinwalk-sponsor-payout-readiness/sponsor-payout-nwc-read-probe.cjs
tmp=
cleanup(){ [[ -n ${tmp} ]] && rm -f -- "${tmp}"; }
trap cleanup EXIT HUP INT TERM

[[ $(docker inspect "${service}" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}') == 'disabled|none|running' ]] || exit 1
"$(dirname "$0")/check-nwc-secret.sh" >/dev/null
[[ -f ${bundle} && ! -L ${bundle} ]] || exit 1
mkdir -p -- "${evidence_dir}"
chmod 0700 -- "${root}" "${evidence_dir}"
[[ ! -L ${root} && ! -L ${evidence_dir} && ! -L ${evidence} ]] || exit 1
tmp=$(mktemp "${evidence_dir}/.nwc-readiness.XXXXXX")
chmod 0600 "${tmp}"

docker run --rm --network host --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
  --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 64 --memory 128m --cpus 0.20 \
  --mount "type=bind,src=${secret},dst=/run/secrets/nwc-uri,readonly" \
  --mount "type=bind,src=${bundle},dst=/app/sponsor-payout-nwc-read-probe.cjs,readonly" \
  --entrypoint node "${image}" /app/sponsor-payout-nwc-read-probe.cjs /run/secrets/nwc-uri > "${tmp}"

mv -fT -- "${tmp}" "${evidence}"
tmp=
chmod 0600 "${evidence}"
[[ $(docker inspect "${service}" --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}') == 'disabled|none|running' ]] || exit 1

echo SPONSOR_PAYOUT_NWC_READINESS_VERIFIED_NO_FUNDS_MOVED
