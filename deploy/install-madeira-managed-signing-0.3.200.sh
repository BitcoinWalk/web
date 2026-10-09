#!/bin/bash
# Non-root staging release: adds signing only; managed reservation and activation remain off.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
previous=/opt/bitcoinwalk-app-staging/releases/0.3.199-9e238c0ed28f
archive=/home/bitcoinwalk/incoming/app-staging-0.3.200.tar.gz
config=/home/bitcoinwalk/incoming/madeira-managed-reservation.conf
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/99-madeira-managed-reservation.conf
test "$(readlink -f "$current")" = "$previous" || { echo 'Staging release changed; review required.'; exit 1; }
test ! -e "$dropin" || { echo 'Managed reservation configuration already exists; review required.'; exit 1; }
test "$(stat -c '%U:%G:%a' /home/bitcoinwalk/.config/bitcoinwalk-rustress-managed/api-token)" = bitcoinwalk:bitcoinwalk:600
systemctl --user is-active --quiet bitcoinwalk-rustress-managed-tunnel.service
! grep -qE 'BITCOINWALK_RUSTRESS_(MANAGED|ACTIVATION)_ENABLED' "$config"
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-managed-signing.XXXXXX)
rollback(){
  status=$?
  if test "$status" -ne 0; then
    test ! -e "$dropin" || mv "$dropin" "$backup/disabled-managed-signing.conf"
    if test "$(readlink -f "$current")" != "$previous"; then
      ln -s "$previous" "$current.rollback.$$"
      mv -Tf "$current.rollback.$$" "$current"
    fi
    systemctl --user daemon-reload
    systemctl --user restart bitcoinwalk-app-staging.service
    echo "Managed signing deployment failed; restored 0.3.199. Evidence: $backup"
  fi
  exit "$status"
}
trap rollback EXIT
install -D -m 600 "$config" "$dropin"
systemctl --user daemon-reload
/home/bitcoinwalk/bin/deploy-staging-app "$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.200"}'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3338/admin/madeira-pilot)" = 200
! grep -RqsE '^Environment=BITCOINWALK_RUSTRESS_(MANAGED|ACTIVATION)_ENABLED=' /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d
trap - EXIT
echo "Madeira managed-reservation signing is available; provisioning and activation remain off. Evidence: $backup"
