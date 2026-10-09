#!/usr/bin/env bash
set -euo pipefail

# Installs the Rustress NWC URI without accepting it in argv, stdin, environment,
# logs or shell history. Production input is read only from the controlling TTY.

if (($# != 0)); then
  echo "No arguments accepted. Paste the connection only at the masked prompt." >&2
  exit 64
fi
if [[ ${EUID} -eq 0 ]]; then
  echo "Run this as the non-root bitcoinwalk service user." >&2
  exit 77
fi

test_mode=${BW_RUSTRESS_SECRET_TEST_MODE:-0}
if [[ ${test_mode} == 1 ]]; then
  secret_root=${BW_RUSTRESS_SECRET_TEST_ROOT:?test root required}
  input_file=${BW_RUSTRESS_SECRET_TEST_INPUT_FILE:?test input required}
  [[ ${secret_root} == /tmp/* ]] || { echo "Unsafe test root" >&2; exit 78; }
  [[ -f ${input_file} && ! -L ${input_file} ]] || { echo "Unsafe test input" >&2; exit 78; }
else
  [[ $(id -un) == bitcoinwalk ]] || {
    echo "Run this as the non-root bitcoinwalk service user." >&2
    exit 77
  }
  secret_root=${HOME}/.local/state/bitcoinwalk-rustress
  [[ -r /dev/tty && -w /dev/tty ]] || {
    echo "A private interactive terminal is required." >&2
    exit 69
  }
fi

old_umask=$(umask)
umask 077
secret_dir=${secret_root}/secrets
secret_file=${secret_dir}/nwc-uri
tmp_file=
secret=
cleanup() {
  [[ -n ${tmp_file} ]] && rm -f -- "${tmp_file}"
  secret=
  umask "${old_umask}"
}
trap cleanup EXIT HUP INT TERM

mkdir -p -- "${secret_dir}"
chmod 0700 -- "${secret_root}" "${secret_dir}"
[[ ! -L ${secret_root} && ! -L ${secret_dir} && ! -L ${secret_file} ]] || {
  echo "Refusing a symbolic-link credential path." >&2
  exit 78
}

if [[ ${test_mode} == 1 ]]; then
  IFS= read -r secret < "${input_file}" || true
else
  printf 'Paste the BitcoinWalk Rustress NWC connection (input hidden): ' > /dev/tty
  IFS= read -r -s secret < /dev/tty || true
  printf '\n' > /dev/tty
fi

if [[ ! ${secret} =~ ^nostr\+walletconnect://[^[:space:]]+$ ]] ||
   ((${#secret} < 80 || ${#secret} > 8192)); then
  echo "The connection was not saved: invalid NWC URI." >&2
  exit 65
fi

tmp_file=$(mktemp "${secret_dir}/.nwc-uri.XXXXXX")
printf '%s\n' "${secret}" > "${tmp_file}"
chmod 0600 -- "${tmp_file}"
sync -f "${tmp_file}" 2>/dev/null || true
mv -fT -- "${tmp_file}" "${secret_file}"
tmp_file=
chmod 0600 -- "${secret_file}"

echo "Rustress wallet credential installed in protected storage."
echo "No payment service was enabled."
