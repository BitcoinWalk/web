#!/bin/bash
# Non-root staging release: persist signed reservation intent before retrying volatile relay reads.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
previous=/opt/bitcoinwalk-app-staging/releases/0.3.200-6687ac99bcc1
archive=/home/bitcoinwalk/incoming/app-staging-0.3.201.tar.gz
test "$(readlink -f "$current")" = "$previous" || { echo 'Staging release changed; review required.'; exit 1; }
test -f /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/100-madeira-managed-reservation-enable.conf
! grep -RqsE '^Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=1$' /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d
systemctl --user is-active --quiet bitcoinwalk-rustress-managed-tunnel.service
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-reservation-retry.XXXXXX)
rollback(){
  status=$?
  if test "$status" -ne 0; then
    if test "$(readlink -f "$current")" != "$previous"; then
      ln -s "$previous" "$current.rollback.$$"
      mv -Tf "$current.rollback.$$" "$current"
      systemctl --user restart bitcoinwalk-app-staging.service
    fi
    echo "Reservation retry deployment failed; restored 0.3.200. Evidence: $backup"
  fi
  exit "$status"
}
trap rollback EXIT
/home/bitcoinwalk/bin/deploy-staging-app "$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.201"}'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3338/admin/madeira-pilot)" = 200
trap - EXIT
echo "App 0.3.201 is active; Madeira reservation intent retries durably. Evidence: $backup"
