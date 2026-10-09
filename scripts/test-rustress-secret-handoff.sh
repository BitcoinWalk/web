#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
installer=${repo}/integrations/rustress/live-wallet/install-nwc-secret.sh
checker=${repo}/integrations/rustress/live-wallet/check-nwc-secret.sh
tmp=$(mktemp -d)
trap 'rm -rf -- "${tmp}"' EXIT

valid=${tmp}/valid
invalid=${tmp}/invalid
printf '%s\n' 'nostr+walletconnect://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?relay=wss%3A%2F%2Frelay.example&secret=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' > "${valid}"
printf '%s\n' 'not-a-wallet-secret' > "${invalid}"
chmod 0600 "${valid}" "${invalid}"

export BW_RUSTRESS_SECRET_TEST_MODE=1
export BW_RUSTRESS_SECRET_TEST_ROOT=${tmp}/state
export BW_RUSTRESS_SECRET_TEST_INPUT_FILE=${valid}
"${installer}" >/dev/null
[[ $("${checker}") == RUSTRESS_NWC_SECRET_READY ]]
[[ $(stat -c '%a' "${tmp}/state") == 700 ]]
[[ $(stat -c '%a' "${tmp}/state/secrets") == 700 ]]
[[ $(stat -c '%a' "${tmp}/state/secrets/nwc-uri") == 600 ]]

export BW_RUSTRESS_SECRET_TEST_INPUT_FILE=${invalid}
if "${installer}" >/dev/null 2>&1; then
  echo "invalid credential accepted" >&2
  exit 1
fi
[[ $("${checker}") == RUSTRESS_NWC_SECRET_READY ]]

ln -s "${tmp}/elsewhere" "${tmp}/link-root"
export BW_RUSTRESS_SECRET_TEST_ROOT=${tmp}/link-root
export BW_RUSTRESS_SECRET_TEST_INPUT_FILE=${valid}
if "${installer}" >/dev/null 2>&1; then
  echo "symbolic-link credential path accepted" >&2
  exit 1
fi

if "${installer}" unexpected-argument >/dev/null 2>&1; then
  echo "command-line secret input accepted" >&2
  exit 1
fi

echo RUSTRESS_SECRET_HANDOFF_TEST_OK
