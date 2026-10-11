#!/bin/sh
set -eu
[ "$(id -un)" = bitcoinwalk ]&&[ "$(id -u)" -ne 0 ]||exit 1
here=$(CDPATH= cd -- "$(dirname "$0")"&&pwd)
root="$HOME/.local/state/bitcoinwalk-rustress/receipt-service";window="$root/window";permanent="$root/permanent"
unit="$HOME/.config/systemd/user/bitcoinwalk-rustress-managed.service";units="$HOME/.config/systemd/user"
worker=bitcoinwalk-rustress-receipt-worker;signer=bitcoinwalk-rustress-receipt-signer;egress=bitcoinwalk-rustress-receipt-relay-egress
[ -f "$window/unit.before" ]&&[ ! -e "$permanent" ]&&[ "$(cat "$root/receipt-mode")" = armed ]||exit 1
install -m 600 "$here/bitcoinwalk-rustress-receipt-proxy.socket" "$units/bitcoinwalk-rustress-receipt-proxy.socket"
install -m 600 "$here/bitcoinwalk-rustress-receipt-proxy@.service" "$units/bitcoinwalk-rustress-receipt-proxy@.service"
cp "$window/unit.before" "$window/unit.permanent";chmod 600 "$window/unit.permanent"
"$here/configure-provider.py" "$window/unit.permanent" "$unit" "$root/secrets/claim-api-token" 1000000000
systemctl --user stop bitcoinwalk-receipt-window-rollback.timer >/dev/null 2>&1||true
cp "$window/unit.permanent" "$unit";chmod 600 "$unit"
docker update --restart unless-stopped "$worker" "$signer" "$egress" >/dev/null
systemctl --user daemon-reload
systemctl --user enable --now bitcoinwalk-rustress-receipt-proxy.socket >/dev/null
systemctl --user restart bitcoinwalk-rustress-managed.service
systemctl --user is-active --quiet bitcoinwalk-rustress-managed.service
systemctl --user is-active --quiet bitcoinwalk-rustress-receipt-proxy.socket
mv "$window" "$permanent"
printf '%s\n' 'RECEIPTS_PERMANENT_ACTIVE scope=all-active-cities maximum_msat=1000000000 proxy=loopback provider_sandbox=strict'
