#!/bin/bash
# Non-root, Madeira-only reservation enablement. Public activation stays impossible.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
expected=/opt/bitcoinwalk-app-staging/releases/0.3.200-6687ac99bcc1
source=/home/bitcoinwalk/incoming/madeira-managed-reservation-enable.conf
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/100-madeira-managed-reservation-enable.conf
test "$(readlink -f "$current")" = "$expected" || { echo 'Staging release changed; review required.'; exit 1; }
test ! -e "$dropin" || { echo 'Reservation worker is already configured; review required.'; exit 1; }
test -f /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/99-madeira-managed-reservation.conf
! grep -RqsE '^Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=1$' /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d
systemctl --user is-active --quiet bitcoinwalk-rustress-managed-tunnel.service
set -a
. /home/bitcoinwalk/.config/bitcoinwalk/app.env
set +a
/opt/bitcoinwalk-app-staging/runtime/bin/node --input-type=module -e '
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync(process.env.BITCOINWALK_PAYMENT_DATABASE,{readOnly:true});
const c="ca20993a-5b7f-443e-931e-8dbaa61d05fe";
const p=db.prepare("SELECT owner IS NOT NULL owner,admin IS NOT NULL admin FROM madeira_managed_pilot WHERE singleton=1").get();
const e=db.prepare("SELECT COUNT(*) n FROM paid_city_entitlement WHERE cityId=?").get(c);
if(!p?.owner||!p?.admin||Number(e.n)!==0)process.exit(1);db.close();'
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-managed-reservation-enable.XXXXXX)
rollback(){
  status=$?
  if test "$status" -ne 0; then
    test ! -e "$dropin" || mv "$dropin" "$backup/disabled-enable.conf"
    systemctl --user daemon-reload
    systemctl --user restart bitcoinwalk-app-staging.service
    echo "Reservation enablement failed; worker disabled. Evidence: $backup"
  fi
  exit "$status"
}
trap rollback EXIT
install -m 600 "$source" "$dropin"
systemctl --user daemon-reload
systemctl --user restart bitcoinwalk-app-staging.service
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.200"}'
trap - EXIT
echo "Madeira disabled managed reservation worker enabled; activation remains off. Evidence: $backup"
