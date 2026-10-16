#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")/.."
archive=app-staging-0.3.391.tar.gz
expected=da43b0e7ec19a8dd5388f24719e3d2016b5f03526b701cadc9e3ad80821cfb13
helper=/home/bitcoinwalk/bin/deploy-staging-app
current=/opt/bitcoinwalk-app-staging/current
service=bitcoinwalk-app-staging.service
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-host-sponsor-invitations.conf
madeira=83f15504-9fca-4d59-a0f6-616a559510df

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test -x "$helper"
previous=$(readlink -f "$current")
test "$previous" = /opt/bitcoinwalk-app-staging/releases/0.3.390-75df16ee6172
test ! -e "$dropin"

backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-host-sponsor-invitations-0.3.391.XXXXXX)
printf '%s\n' "$previous" >"$backup/current.before"
cat >"$backup/zz-madeira-host-sponsor-invitations.conf" <<EOF
[Service]
Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1
Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=$madeira
EOF
chmod 0600 "$backup/zz-madeira-host-sponsor-invitations.conf"

rollback(){
  status=$?
  if test "$status" -ne 0; then
    rm -f "$dropin"
    systemctl --user daemon-reload
    replacement="$current.rollback.$$"
    ln -s "$previous" "$replacement"
    mv -Tf "$replacement" "$current"
    systemctl --user restart "$service" || true
    echo "Madeira host invitation activation failed; app and feature setting restored. Evidence: $backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT INT TERM HUP

install -m 0600 "$backup/zz-madeira-host-sponsor-invitations.conf" "$dropin"
systemctl --user daemon-reload
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.391"}'
pid=$(systemctl --user show "$service" -p MainPID --value)
test "$pid" -gt 0
grep -zqx 'BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "/proc/$pid/environ"
grep -zqx "BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=$madeira" "/proc/$pid/environ"
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3338/admin/sponsor)" = 200

trap - EXIT INT TERM HUP
echo "Madeira host sponsor invitations 0.3.391 are active on staging. The payout sender remains disabled and no wallet was funded or payment sent. Evidence: $backup"
