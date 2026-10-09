#!/bin/sh
set -eu
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||exit 1
root="$HOME/.local/state/bitcoinwalk-rustress";mode="$root/payout-mode";tmp="$root/.payout-mode.$$";trap 'rm -f "$tmp"' EXIT HUP INT TERM
docker rm -f bitcoinwalk-rustress-payout >/dev/null 2>&1||true;umask 077;printf '%s\n' disabled>"$tmp";chmod 600 "$tmp";mv "$tmp" "$mode";trap - EXIT HUP INT TERM
printf '%s\n' "Payout service stopped and disabled. Outstanding obligations remain in the ledger."
