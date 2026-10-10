#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
previous=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.211-c2b985cc8851
archive=/home/bitcoinwalk/incoming/app-production-0.3.212.tar.gz
installer=/home/bitcoinwalk/incoming/install-named-nip05.cjs
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
unit=bitcoinwalk-app-production.service
runtime=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
pubkey=4506e04e4b7079ce07e38e9875678a81ad33a456c696d708ef8e9a2d8c16ba04
test "$(readlink -f "$current")" = "$previous"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.211"}'
for file in "$archive" "$archive.sha256" "$installer" "$database";do test -f "$file" && test ! -L "$file";done
backup=$(mktemp -d /home/bitcoinwalk/backups/endo-production-nip05.XXXXXX)
"$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
rollback(){ status=$?;if test "$status" -ne 0;then systemctl --user stop "$unit"||true;rm -f "$database-wal" "$database-shm";cp -p "$backup/payments.sqlite" "$database";ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current";systemctl --user start "$unit"||true;echo "Endo NIP-05 failed; restored 0.3.211. Evidence: $backup";fi;exit "$status";};trap rollback EXIT
/home/bitcoinwalk/bin/deploy-production-app "$archive"
systemctl --user stop "$unit"
"$runtime" "$installer" "$database" endo "$pubkey"|tee "$backup/install-result"
systemctl --user start "$unit"
ready=false;for attempt in $(seq 1 40);do if test "$(curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz 2>/dev/null||true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.212"}';then ready=true;break;fi;sleep 1;done;test "$ready" = true
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3345/.well-known/nostr.json?name=endo')" = "{\"names\":{\"endo\":\"$pubkey\"}}"
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3345/.well-known/lnurlp/endo)" = 404
headers="$backup/headers";test "$(curl -fsS --max-time 15 -D "$headers" 'https://bitcoinwalk.org/.well-known/nostr.json?name=endo')" = "{\"names\":{\"endo\":\"$pubkey\"}}";tr -d '\r' <"$headers"|grep -Fxiq 'access-control-allow-origin: *'
trap - EXIT
echo "Production app 0.3.212 is active; endo@bitcoinwalk.org NIP-05 resolves. Lightning remains closed. Evidence: $backup"
