#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
installer=${repo}/integrations/sponsor-payout-readiness/install-nwc-secret.sh
checker=${repo}/integrations/sponsor-payout-readiness/check-nwc-secret.sh
tmp=$(mktemp -d)
trap 'rm -rf -- "${tmp}"' EXIT

valid=${tmp}/valid
valid_crlf=${tmp}/valid-crlf
invalid=${tmp}/invalid
printf '%s\n' 'nostr+walletconnect://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?relay=wss%3A%2F%2Frelay.example&secret=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' > "${valid}"
printf '%s\r\n' 'nostr+walletconnect://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?relay=wss%3A%2F%2Frelay.example&secret=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' > "${valid_crlf}"
printf '%s\n' 'not-a-wallet-secret' > "${invalid}"
chmod 0600 "${valid}" "${valid_crlf}" "${invalid}"

export BW_SPONSOR_PAYOUT_SECRET_TEST_MODE=1
export BW_SPONSOR_PAYOUT_SECRET_TEST_ROOT=${tmp}/state
export BW_SPONSOR_PAYOUT_SECRET_TEST_INPUT_FILE=${valid}
"${installer}" >/dev/null
[[ $("${checker}") == SPONSOR_PAYOUT_NWC_SECRET_READY ]]
[[ $(stat -c '%a' "${tmp}/state") == 700 ]]
[[ $(stat -c '%a' "${tmp}/state/secrets") == 700 ]]
[[ $(stat -c '%a' "${tmp}/state/secrets/nwc-uri") == 600 ]]

export BW_SPONSOR_PAYOUT_SECRET_TEST_INPUT_FILE=${valid_crlf}
"${installer}" >/dev/null
[[ $("${checker}") == SPONSOR_PAYOUT_NWC_SECRET_READY ]]
[[ $(tail -c 1 "${tmp}/state/secrets/nwc-uri" | od -An -tuC | tr -d ' ') == 10 ]]

export BW_SPONSOR_PAYOUT_SECRET_TEST_INPUT_FILE=${invalid}
if "${installer}" >/dev/null 2>&1; then exit 1; fi
[[ $("${checker}") == SPONSOR_PAYOUT_NWC_SECRET_READY ]]

ln -s "${tmp}/elsewhere" "${tmp}/link-root"
export BW_SPONSOR_PAYOUT_SECRET_TEST_ROOT=${tmp}/link-root
export BW_SPONSOR_PAYOUT_SECRET_TEST_INPUT_FILE=${valid}
if "${installer}" >/dev/null 2>&1; then exit 1; fi
if "${installer}" unexpected-argument >/dev/null 2>&1; then exit 1; fi

echo SPONSOR_PAYOUT_SECRET_HANDOFF_TEST_OK
