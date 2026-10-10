#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
expected=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.219-8bf7d34830ec
env=/home/bitcoinwalk/.config/bitcoinwalk/production.env
unit=bitcoinwalk-app-production.service
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
source=/var/lib/bitcoinwalk-app-staging/payments.sqlite
runtime=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
importer=/home/bitcoinwalk/incoming/import-madeira-production-activation.cjs
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-production-lnurl.XXXXXX)
test "$(readlink -f "$current")" = "$expected"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.219"}'
grep -Fxq 'BITCOINWALK_RUSTRESS_MANAGED_ORIGIN=http://127.0.0.1:18895' "$env"
grep -Fxq 'BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT=activation-v1' "$env"
grep -Fxq 'BITCOINWALK_RUSTRESS_NIP05_ENABLED=1' "$env"
grep -Fxq 'BITCOINWALK_RUSTRESS_STANDALONE_LNURL_ENABLED=1' "$env"
! grep -q '^BITCOINWALK_RUSTRESS_LNURL_ENABLED=' "$env"
for file in "$database" "$source" "$importer";do test -f "$file"&&test ! -L "$file";done
cp -p "$env" "$backup/production.env";"$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
rollback(){ status=$?;if test "$status" -ne 0;then systemctl --user stop "$unit"||true;cp -p "$backup/production.env" "$env";rm -f "$database-wal" "$database-shm";cp -p "$backup/payments.sqlite" "$database";systemctl --user start "$unit"||true;echo "Madeira LNURL cutover failed; state restored. Evidence: $backup";fi;exit "$status";}
trap rollback EXIT
systemctl --user stop "$unit";"$runtime" "$importer" "$source" "$database"|tee "$backup/import-result"
printf '%s\n' 'BITCOINWALK_RUSTRESS_LNURL_ENABLED=1' >>"$env";chmod 600 "$env";systemctl --user start "$unit"
ready=false;for attempt in $(seq 1 40);do if test "$(curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz 2>/dev/null||true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.219"}';then ready=true;break;fi;sleep 1;done;test "$ready" = true
metadata=$(curl -fsS --max-time 15 https://bitcoinwalk.org/.well-known/lnurlp/madeira);echo "$metadata"|grep -q '"tag":"payRequest"';echo "$metadata"|grep -q 'https://bitcoinwalk.org/lnurlp/madeira/callback'
invoice=$(curl -fsS --max-time 20 'https://bitcoinwalk.org/lnurlp/madeira/callback?amount=1000');echo "$invoice"|grep -q '"pr":"lnbc';echo "$invoice"|grep -q '"routes":\[\]'
test "$(curl -fsS --max-time 15 'https://bitcoinwalk.org/.well-known/nostr.json?name=madeira')" = '{"names":{"madeira":"74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0"}}'
for name in endo donate;do test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://bitcoinwalk.org/.well-known/lnurlp/$name")" = 200;done
sha256sum "$env" "$database" >"$backup/accepted.sha256";trap - EXIT
echo "MADEIRA_LNURL_PRODUCTION_OK unpaid_invoice_created=yes evidence=$backup"
