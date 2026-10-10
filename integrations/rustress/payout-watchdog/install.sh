#!/bin/sh
set -eu
[ "$(id -u)" -ne 0 ]&&[ "$(id -un)" = bitcoinwalk ]||exit 1;sha256sum -c SHA256SUMS >/dev/null
install -m 700 watchdog.sh "$HOME/.local/libexec/bitcoinwalk-rustress-payout-operation/watchdog.sh"
install -m 600 bitcoinwalk-payout-operation-monitor.service "$HOME/.config/systemd/user/bitcoinwalk-payout-operation-monitor.service"
systemctl --user daemon-reload
printf '%s\n' 'Payout operation fail-closed watchdog installed.'
