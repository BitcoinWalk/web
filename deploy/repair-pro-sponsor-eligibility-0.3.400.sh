#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")/.."
archive=app-staging-0.3.400.tar.gz
expected=APP_ARCHIVE_SHA256
helper=/home/bitcoinwalk/bin/deploy-staging-app
current=/opt/bitcoinwalk-app-staging/current
service=bitcoinwalk-app-staging.service
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-host-sponsor-invitations.conf
source_db=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
target_db=/var/lib/bitcoinwalk-app-staging/payments.sqlite
test "$(sha256sum "$archive"|cut -d' ' -f1)" = "$expected";test -x "$helper";test -f mirror-madeira-sponsor-eligibility.mjs
previous=$(readlink -f "$current");case "$previous" in /opt/bitcoinwalk-app-staging/releases/0.3.399-*) ;; *) echo "Unexpected active staging release: $previous" >&2;exit 1;;esac
test -f "$dropin";grep -qx 'Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "$dropin";grep -Fqx 'Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=*' "$dropin"
backup=$(mktemp -d /home/bitcoinwalk/backups/pro-sponsor-eligibility-0.3.400.XXXXXX);printf '%s\n' "$previous" >"$backup/current.before"
rollback(){ status=$?;if test "$status" -ne 0;then replacement="$current.rollback.$$";ln -s "$previous" "$replacement";mv -Tf "$replacement" "$current";systemctl --user restart "$service"||true;echo "Pro sponsor eligibility repair failed; the previous app release was restored. Evidence: $backup" >&2;fi;exit "$status"; }
trap rollback EXIT INT TERM HUP
/opt/bitcoinwalk-app-staging/runtime/bin/node mirror-madeira-sponsor-eligibility.mjs "$source_db" "$target_db"
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256";"$helper" "$PWD/$archive"
systemctl --user restart "$service"
healthy=0;for attempt in $(seq 1 20);do if test "$(curl -fsS --max-time 3 http://127.0.0.1:3338/api/healthz 2>/dev/null||true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.400"}';then healthy=1;break;fi;sleep 1;done;test "$healthy" = 1
pid=$(systemctl --user show "$service" -p MainPID --value);test "$pid" -gt 0;grep -Fzqx 'BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "/proc/$pid/environ";grep -Fzqx 'BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=*' "/proc/$pid/environ"
trap - EXIT INT TERM HUP
echo "Canonical Pro sponsor eligibility 0.3.400 accepted. A complete Pro payout owner can invite sponsors even when its production city record is not copied into staging. The payout sender remains disabled and no payment was sent. Evidence: $backup"
