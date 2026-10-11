#!/bin/sh
set -eu
[ "$(id -un)" = bitcoinwalk ]&&[ "$(id -u)" -ne 0 ]||exit 1
root="$HOME/.local/state/bitcoinwalk-rustress/receipt-service";window="$root/window";unit="$HOME/.config/systemd/user/bitcoinwalk-rustress-managed.service"
worker=bitcoinwalk-rustress-receipt-worker;signer=bitcoinwalk-rustress-receipt-signer;egress=bitcoinwalk-rustress-receipt-relay-egress;baseline="$worker-window-baseline"
systemctl --user stop bitcoinwalk-rustress-managed.service >/dev/null 2>&1||true
if [ -f "$window/unit.before" ]&&[ ! -L "$window/unit.before" ];then cp "$window/unit.before" "$unit";chmod 600 "$unit";fi
systemctl --user daemon-reload
docker rm -f "$worker" "$signer" "$egress" >/dev/null 2>&1||true
rmdir "${XDG_RUNTIME_DIR:?}/bitcoinwalk-rustress-receipt-worker" >/dev/null 2>&1||true
printf '%s\n' disabled >"$root/receipt-mode";chmod 600 "$root/receipt-mode"
if docker container inspect "$baseline" >/dev/null 2>&1;then docker rename "$baseline" "$worker";docker start "$worker" >/dev/null;fi
systemctl --user start bitcoinwalk-rustress-managed.service
systemctl --user is-active --quiet bitcoinwalk-rustress-managed.service
docker exec "$worker" node /app/verify-rustress-receipt-worker.cjs disabled >/dev/null
if [ -d "$window" ];then mv "$window" "$root/window-completed-$(date -u +%Y%m%dT%H%M%SZ)";fi
printf '%s\n' 'RECEIPT_WINDOW_ROLLED_BACK metadata=disabled worker=disabled signer=stopped egress=stopped'
