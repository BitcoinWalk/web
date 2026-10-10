#!/bin/bash
# Publish only Madeira's signed NIP-05 binding in production. Runs as bitcoinwalk.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
previous=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.191-253acfe8b829
archive=/home/bitcoinwalk/incoming/app-production-0.3.210.tar.gz
importer=/home/bitcoinwalk/incoming/import-madeira-production-nip05.cjs
environment=/home/bitcoinwalk/.config/bitcoinwalk/production.env
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
source=/var/lib/bitcoinwalk-app-staging/payments.sqlite
unit=bitcoinwalk-app-production.service
runtime=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
expected='{"names":{"madeira":"74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0"}}'

test "$(readlink -f "$current")" = "$previous" || { echo 'Production release changed; review required.'; exit 1; }
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.191"}'
for file in "$archive" "$archive.sha256" "$importer" "$environment" "$database" "$source";do test -f "$file" && test ! -L "$file";done
! grep -Eq '^BITCOINWALK_RUSTRESS_(ACTIVATION|NIP05|LNURL)_ENABLED=1$' /home/bitcoinwalk/.config/bitcoinwalk/app.env "$environment"

backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-production-nip05.XXXXXX)
cp -p "$environment" "$backup/production.env"
readlink -f "$current" >"$backup/current.before"
"$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
sha256sum "$archive" "$importer" "$backup/production.env" "$backup/payments.sqlite" >"$backup/before.sha256"

rollback(){ status=$?;if test "$status" -ne 0;then
  systemctl --user stop "$unit" || true
  cp -p "$backup/production.env" "$environment"
  rm -f "$database-wal" "$database-shm"
  cp -p "$backup/payments.sqlite" "$database"
  ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current"
  systemctl --user daemon-reload;systemctl --user start "$unit" || true
  echo "Production NIP-05 activation failed; restored 0.3.191 and its database/configuration. Evidence: $backup";fi;exit "$status"; }
trap rollback EXIT

/home/bitcoinwalk/bin/deploy-production-app "$archive"
systemctl --user stop "$unit"
"$runtime" "$importer" "$source" "$database" | tee "$backup/import-result"
awk -F= '!($1=="BITCOINWALK_RUSTRESS_MANAGED_ORIGIN"||$1=="BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT"||$1=="BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED"||$1=="BITCOINWALK_RUSTRESS_NIP05_ENABLED"||$1=="BITCOINWALK_RUSTRESS_LNURL_ENABLED")' "$environment" >"$environment.next"
cat >>"$environment.next" <<'EOF'
BITCOINWALK_RUSTRESS_MANAGED_ORIGIN=http://127.0.0.1:18895
BITCOINWALK_RUSTRESS_MANAGED_MADEIRA_PILOT=activation-v1
BITCOINWALK_RUSTRESS_NIP05_ENABLED=1
EOF
chmod 0600 "$environment.next";mv "$environment.next" "$environment"
! grep -Eq '^BITCOINWALK_RUSTRESS_(ACTIVATION|LNURL)_ENABLED=1$' /home/bitcoinwalk/.config/bitcoinwalk/app.env "$environment"
grep -Fxq 'BITCOINWALK_RUSTRESS_NIP05_ENABLED=1' "$environment"
systemctl --user daemon-reload;systemctl --user start "$unit"
ready=false;for attempt in $(seq 1 40);do if test "$(curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz 2>/dev/null || true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.210"}';then ready=true;break;fi;sleep 1;done;test "$ready" = true
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3345/.well-known/nostr.json?name=madeira')" = "$expected"
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3345/.well-known/lnurlp/madeira)" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 'http://127.0.0.1:3345/lnurlp/madeira/callback?amount=1000')" = 404
headers="$backup/nip05.headers";test "$(curl -fsS --max-time 15 -D "$headers" 'https://bitcoinwalk.org/.well-known/nostr.json?name=madeira')" = "$expected"
tr -d '\r' <"$headers" | grep -Fxiq 'access-control-allow-origin: *'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://bitcoinwalk.org/.well-known/lnurlp/madeira)" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 'https://bitcoinwalk.org/lnurlp/madeira/callback?amount=1000')" = 404
sha256sum "$environment" "$database" >"$backup/accepted.sha256"
trap - EXIT
echo "Production app 0.3.210 accepted with Madeira NIP-05 active and every Lightning path closed. Evidence: $backup"
