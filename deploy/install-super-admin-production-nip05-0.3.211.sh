#!/bin/bash
# Publish the BitcoinWalk root NIP-05 identity, without provisioning Lightning.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
previous=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.210-e0f23af07bee
archive=/home/bitcoinwalk/incoming/app-production-0.3.211.tar.gz
installer=/home/bitcoinwalk/incoming/install-super-admin-nip05.cjs
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
unit=bitcoinwalk-app-production.service
runtime=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
root_mapping='{"names":{"_":"90cf043861e5b5a9972cb7b529a5ba71b215d6d1e314c749d5526ec133f1db73"}}'
madeira_mapping='{"names":{"madeira":"74d0c61ca913765c188dfc2265d27bcb401a1906ebd79c901dc977a69a2189f0"}}'

test "$(readlink -f "$current")" = "$previous" || { echo 'Production release changed; review required.'; exit 1; }
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.210"}'
for file in "$archive" "$archive.sha256" "$installer" "$database";do test -f "$file" && test ! -L "$file";done
grep -Fxq 'BITCOINWALK_RUSTRESS_NIP05_ENABLED=1' /home/bitcoinwalk/.config/bitcoinwalk/production.env
! grep -Eq '^BITCOINWALK_RUSTRESS_(ACTIVATION|LNURL)_ENABLED=1$' /home/bitcoinwalk/.config/bitcoinwalk/app.env /home/bitcoinwalk/.config/bitcoinwalk/production.env
backup=$(mktemp -d /home/bitcoinwalk/backups/super-admin-production-nip05.XXXXXX)
readlink -f "$current" >"$backup/current.before"
"$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
sha256sum "$archive" "$installer" "$backup/payments.sqlite" >"$backup/before.sha256"

rollback(){ status=$?;if test "$status" -ne 0;then
  systemctl --user stop "$unit" || true;rm -f "$database-wal" "$database-shm";cp -p "$backup/payments.sqlite" "$database"
  ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current"
  systemctl --user daemon-reload;systemctl --user start "$unit" || true
  echo "Super-admin NIP-05 activation failed; restored 0.3.210 and its database. Evidence: $backup";fi;exit "$status"; }
trap rollback EXIT

/home/bitcoinwalk/bin/deploy-production-app "$archive"
systemctl --user stop "$unit"
"$runtime" "$installer" "$database" | tee "$backup/import-result"
systemctl --user start "$unit"
ready=false;for attempt in $(seq 1 40);do if test "$(curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz 2>/dev/null || true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.211"}';then ready=true;break;fi;sleep 1;done;test "$ready" = true
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3345/.well-known/nostr.json?name=_')" = "$root_mapping"
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3345/.well-known/nostr.json?name=madeira')" = "$madeira_mapping"
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3345/.well-known/lnurlp/_)" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3345/.well-known/lnurlp/madeira)" = 404
headers="$backup/nip05.headers";test "$(curl -fsS --max-time 15 -D "$headers" 'https://bitcoinwalk.org/.well-known/nostr.json?name=_')" = "$root_mapping"
tr -d '\r' <"$headers" | grep -Fxiq 'access-control-allow-origin: *'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://bitcoinwalk.org/.well-known/lnurlp/_)" = 404
sha256sum "$database" >"$backup/accepted.sha256"
trap - EXIT
echo "Production app 0.3.211 accepted with bitcoinwalk.org NIP-05 verified and no root Lightning address. Evidence: $backup"
