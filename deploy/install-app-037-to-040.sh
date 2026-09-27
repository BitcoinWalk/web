#!/bin/sh
# Direct guarded recovery: active staging 0.3.37 to 0.3.40.
set -eu

if [ "$(id -u)" -ne 0 ]; then echo "Run this installer with sudo." >&2; exit 1; fi
cd "$(dirname "$0")"
archive=app-staging-0.3.40.tar.gz
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
release=/opt/bitcoinwalk-app-staging/releases/0.3.40
previous=/opt/bitcoinwalk-app-staging/releases/0.3.37

sha256sum -c "$archive.sha256"
test -f "$unit"
test ! -e "$release"
grep -qx "WorkingDirectory=$previous" "$unit"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.37"'
backup=$(mktemp -d /var/backups/bitcoinwalk-app-037-to-040.XXXXXX)
cp -p "$unit" "$backup/service.before"
rollback(){ code=$?; trap - EXIT; if [ "$code" -ne 0 ]; then cp -p "$backup/service.before" "$unit"; systemctl daemon-reload; systemctl restart bitcoinwalk-app-staging; echo "Activation failed; previous app service restored. Backup: $backup" >&2; fi; exit "$code"; }
trap rollback EXIT

install -d -m 0755 "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/server.js"
test -f "$release/.next/BUILD_ID"
test ! -e "$release/.next/cache"
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
sed "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" "$unit" >"$backup/service.candidate"
grep -qx "WorkingDirectory=$release" "$backup/service.candidate"
install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload
systemctl restart bitcoinwalk-app-staging
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.40"'; then ready=true; break; fi; sleep 1; done
test "$ready" = true
trap - EXIT
echo "Staging upgraded directly from 0.3.37 to 0.3.40."
echo "Delegation recognizes the current 0.8.3 relay and dashboard reads are batched."
echo "Protected service backup: $backup/service.before"
echo "Previous release retained at $previous"
