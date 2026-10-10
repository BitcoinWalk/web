#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
previous=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.212-2e75075663ac
archive=/home/bitcoinwalk/incoming/app-production-0.3.213.tar.gz
installer=/home/bitcoinwalk/incoming/install-standalone-addresses.cjs
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
env=/home/bitcoinwalk/.config/bitcoinwalk/production.env
unit=bitcoinwalk-app-production.service
runtime=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
test "$(readlink -f "$current")" = "$previous"
test "$(curl -fsS --max-time 5 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.212"}'
for file in "$archive" "$archive.sha256" "$installer" "$database" "$env";do test -f "$file"&&test ! -L "$file";done
grep -Fxq 'BITCOINWALK_RUSTRESS_NIP05_ENABLED=1' "$env"
! grep -q '^BITCOINWALK_RUSTRESS_STANDALONE_LNURL_ENABLED=' "$env"
! grep -q '^BITCOINWALK_RUSTRESS_LNURL_ENABLED=1$' "$env"
backup=$(mktemp -d /home/bitcoinwalk/backups/standalone-lnurl-production.XXXXXX)
cp -p "$env" "$backup/production.env"
"$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
rollback(){ status=$?;if test "$status" -ne 0;then systemctl --user stop "$unit"||true;cp -p "$backup/production.env" "$env";rm -f "$database-wal" "$database-shm";cp -p "$backup/payments.sqlite" "$database";ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current";systemctl --user start "$unit"||true;echo "Standalone LNURL cutover failed; rollback evidence: $backup";fi;exit "$status";}
trap rollback EXIT
/home/bitcoinwalk/bin/deploy-production-app "$archive"
systemctl --user stop "$unit"
"$runtime" "$installer" "$database"|tee "$backup/install-result"
printf '%s\n' 'BITCOINWALK_RUSTRESS_STANDALONE_LNURL_ENABLED=1' >>"$env"
systemctl --user start "$unit"
ready=false
for attempt in $(seq 1 40);do if test "$(curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz 2>/dev/null||true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.213"}';then ready=true;break;fi;sleep 1;done
test "$ready" = true
for name in endo donate;do metadata=$(curl -fsS --max-time 15 "https://bitcoinwalk.org/.well-known/lnurlp/$name");echo "$metadata"|grep -q '"tag":"payRequest"';echo "$metadata"|grep -q "https://bitcoinwalk.org/lnurlp/$name/callback";invoice=$(curl -fsS --max-time 20 "https://bitcoinwalk.org/lnurlp/$name/callback?amount=1000");echo "$invoice"|grep -q '"pr":"lnbc';echo "$invoice"|grep -q '"routes":\[\]';done
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 https://bitcoinwalk.org/.well-known/lnurlp/madeira)" = 404
test "$(curl -fsS --max-time 10 'https://bitcoinwalk.org/.well-known/nostr.json?name=endo')" = '{"names":{"endo":"4506e04e4b7079ce07e38e9875678a81ad33a456c696d708ef8e9a2d8c16ba04"}}'
trap - EXIT
echo "STANDALONE_LNURL_PRODUCTION_0.3.213_OK evidence=$backup"
