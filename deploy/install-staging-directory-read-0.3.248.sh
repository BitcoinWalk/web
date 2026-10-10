#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-staging-0.3.248.tar.gz
expected=c52be61012f22a7d8d014eb39ba8c396907b31a392d55255a98e3124069fa42f
helper=/home/bitcoinwalk/bin/deploy-staging-app
current=/opt/bitcoinwalk-app-staging/current
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-server-directory-read.conf

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test -x "$helper"
previous=$(readlink -f "$current")
test "$previous" = /opt/bitcoinwalk-app-staging/releases/0.3.246-1a1b3cbf29a2
test ! -e "$dropin"

backup=$(mktemp -d /home/bitcoinwalk/backups/app-staging-directory-read-0.3.248.XXXXXX)
printf '%s\n' "$previous" >"$backup/current.before"
cat >"$backup/zz-server-directory-read.conf" <<'EOF'
[Service]
Environment=BITCOINWALK_SERVER_DIRECTORY_READ_RELAY=ws://127.0.0.1:3343/
EOF
chmod 0600 "$backup/zz-server-directory-read.conf"

rollback(){
  status=$?
  if test "$status" -ne 0; then
    rm -f "$dropin"
    systemctl --user daemon-reload
    replacement="$current.rollback.$$"
    ln -s "$previous" "$replacement"
    mv -Tf "$replacement" "$current"
    systemctl --user restart bitcoinwalk-app-staging.service || true
    echo "Staging directory-read activation failed; release and service setting restored. Evidence: $backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT INT TERM HUP

install -m 0600 "$backup/zz-server-directory-read.conf" "$dropin"
systemctl --user daemon-reload
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.248"}'
pid=$(systemctl --user show bitcoinwalk-app-staging.service -p MainPID --value)
test "$pid" -gt 0
grep -zqx 'BITCOINWALK_SERVER_DIRECTORY_READ_RELAY=ws://127.0.0.1:3343/' "/proc/$pid/environ"

trap - EXIT INT TERM HUP
echo "Staging app 0.3.248 and private primary-directory reads are active. Evidence: $backup"
