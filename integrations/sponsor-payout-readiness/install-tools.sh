#!/usr/bin/env sh
set -eu

fail(){ printf '%s\n' 'Sponsor payout readiness tool installation failed.' >&2;exit 1; }
[ "$#" -eq 0 ] || fail
[ "$(id -u)" -ne 0 ] && [ "$(id -un)" = bitcoinwalk ] || fail
sha256sum -c SHA256SUMS
docker info --format '{{json .SecurityOptions}}' | grep -q '"name=rootless"' || fail
[ "$(docker inspect bitcoinwalk-sponsor-payout --format '{{index .Config.Labels "org.bitcoinwalk.mode"}}|{{.HostConfig.NetworkMode}}|{{.State.Status}}')" = 'disabled|none|running' ] || fail
docker image inspect bitcoinwalk-sponsor-payout:0.1.0 >/dev/null 2>&1 || fail

target=${HOME}/.local/libexec/bitcoinwalk-sponsor-payout-readiness
mkdir -p "${target}"
chmod 0700 "${target}"
[ ! -L "${target}" ] || fail
install -m 0700 install-nwc-secret.sh check-nwc-secret.sh run-readiness-probe.sh "${target}/"
install -m 0600 sponsor-payout-nwc-read-probe.cjs "${target}/"

printf '%s\n' 'Sponsor payout readiness tools installed. The payout service remains disabled and no credential was loaded.'
