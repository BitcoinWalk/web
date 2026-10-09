#!/usr/bin/env bash
set -euo pipefail

test_mode=${BW_RUSTRESS_SECRET_TEST_MODE:-0}
if [[ ${test_mode} == 1 ]]; then
  secret_root=${BW_RUSTRESS_SECRET_TEST_ROOT:?test root required}
  [[ ${secret_root} == /tmp/* ]] || exit 78
else
  [[ ${EUID} -ne 0 && $(id -un) == bitcoinwalk ]] || exit 77
  secret_root=${HOME}/.local/state/bitcoinwalk-rustress
fi
secret_dir=${secret_root}/secrets
secret_file=${secret_dir}/nwc-uri

[[ -d ${secret_root} && -d ${secret_dir} && -f ${secret_file} ]] || exit 1
[[ ! -L ${secret_root} && ! -L ${secret_dir} && ! -L ${secret_file} ]] || exit 1
[[ $(stat -c '%a' "${secret_root}") == 700 ]] || exit 1
[[ $(stat -c '%a' "${secret_dir}") == 700 ]] || exit 1
[[ $(stat -c '%a' "${secret_file}") == 600 ]] || exit 1
[[ $(stat -c '%u' "${secret_file}") == ${EUID} ]] || exit 1
grep -Eq '^nostr\+walletconnect://[^[:space:]]+$' "${secret_file}" || exit 1
[[ $(wc -c < "${secret_file}") -le 8193 ]] || exit 1

echo RUSTRESS_NWC_SECRET_READY
