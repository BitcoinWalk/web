#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")/.."
archive=app-staging-0.3.398.tar.gz
expected=APP_ARCHIVE_SHA256
helper=/home/bitcoinwalk/bin/deploy-staging-app
current=/opt/bitcoinwalk-app-staging/current
service=bitcoinwalk-app-staging.service
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-host-sponsor-invitations.conf
source_db=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
target_db=/var/lib/bitcoinwalk-app-staging/payments.sqlite

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test -x "$helper"
test -f mirror-madeira-sponsor-eligibility.mjs
previous=$(readlink -f "$current")
case "$previous" in /opt/bitcoinwalk-app-staging/releases/0.3.394-*|/opt/bitcoinwalk-app-staging/releases/0.3.397-*) ;; *) echo "Unexpected active staging release: $previous" >&2; exit 1 ;; esac
test -f "$dropin"
grep -qx 'Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "$dropin"

backup=$(mktemp -d /home/bitcoinwalk/backups/pro-sponsor-eligibility-0.3.398.XXXXXX)
cp "$dropin" "$backup/feature.conf.before"
printf '%s\n' "$previous" >"$backup/current.before"
cat >"$backup/feature.conf.candidate" <<'EOF'
[Service]
Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1
Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=*
EOF

rollback(){
 status=$?
 if test "$status" -ne 0; then
  install -m 0600 "$backup/feature.conf.before" "$dropin"
  systemctl --user daemon-reload
  replacement="$current.rollback.$$";ln -s "$previous" "$replacement";mv -Tf "$replacement" "$current"
  systemctl --user restart "$service" || true
  echo "Pro sponsor eligibility repair failed; app and feature scope restored. Database writes are transactional. Evidence: $backup" >&2
 fi
 exit "$status"
}
trap rollback EXIT INT TERM HUP

/opt/bitcoinwalk-app-staging/runtime/bin/node mirror-madeira-sponsor-eligibility.mjs "$source_db" "$target_db"
install -m 0600 "$backup/feature.conf.candidate" "$dropin"
systemctl --user daemon-reload
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
/opt/bitcoinwalk-app-staging/runtime/bin/node mirror-madeira-sponsor-eligibility.mjs "$source_db" "$target_db" --apply
systemctl --user restart "$service"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.398"}'
pid=$(systemctl --user show "$service" -p MainPID --value);test "$pid" -gt 0
grep -Fzqx 'BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "/proc/$pid/environ"
grep -Fzqx 'BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=*' "/proc/$pid/environ"

trap - EXIT INT TERM HUP
echo "Verified Pro sponsor eligibility 0.3.398 accepted. Madeira's reviewed Pro evidence is reconciled on staging; future eligible Pro cities are selected dynamically. The payout sender remains disabled and no payment was sent. Evidence: $backup"
