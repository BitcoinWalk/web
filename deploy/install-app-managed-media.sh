#!/bin/sh
# Staging-only 0.3.41: persistent managed media and super-admin alerts.
set -eu
if [ "$(id -u)" -ne 0 ]; then echo "Run this installer with sudo." >&2; exit 1; fi
cd "$(dirname "$0")"
archive=app-staging-0.3.41.tar.gz
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
release=/opt/bitcoinwalk-app-staging/releases/0.3.41
previous=/opt/bitcoinwalk-app-staging/releases/0.3.40
sha256sum -c "$archive.sha256"
test -f "$unit"; test ! -e "$release"
grep -qx "WorkingDirectory=$previous" "$unit"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.40"'
! grep -q '^StateDirectory=bitcoinwalk-app-media$' "$unit"
backup=$(mktemp -d /var/backups/bitcoinwalk-app-managed-media.XXXXXX)
cp -p "$unit" "$backup/service.before"
rollback(){ code=$?; trap - EXIT; if [ "$code" -ne 0 ]; then cp -p "$backup/service.before" "$unit"; systemctl daemon-reload; systemctl restart bitcoinwalk-app-staging; echo "Activation failed; previous app service restored. Backup: $backup" >&2; fi; exit "$code"; }
trap rollback EXIT
install -d -m 0755 "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/server.js"; test -f "$release/.next/BUILD_ID"; test ! -e "$release/.next/cache"
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
sed -e "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" \
 -e '/^Environment=BITCOINWALK_SERVER_READ_RELAY=/a Environment=BITCOINWALK_MEDIA_ROOT=/var/lib/bitcoinwalk-app-media\
Environment=BITCOINWALK_MEDIA_PUBLIC_ORIGIN=https://app-staging.bitcoinwalk.org' \
 -e '/^CacheDirectoryMode=/a StateDirectory=bitcoinwalk-app-media\
StateDirectoryMode=0700' "$unit" >"$backup/service.candidate"
grep -qx "WorkingDirectory=$release" "$backup/service.candidate"
grep -qx 'StateDirectory=bitcoinwalk-app-media' "$backup/service.candidate"
grep -qx 'Environment=BITCOINWALK_MEDIA_ROOT=/var/lib/bitcoinwalk-app-media' "$backup/service.candidate"
install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload
systemctl restart bitcoinwalk-app-staging
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.41"'; then ready=true; break; fi; sleep 1; done
test "$ready" = true
test -d /var/lib/bitcoinwalk-app-media
trap - EXIT
echo "Staging 0.3.41 installed with persistent managed-media storage and integrity Alerts."
echo "Protected service backup: $backup/service.before"
echo "Previous release retained at $previous"
