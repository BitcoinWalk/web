#!/bin/sh
# Staging-only 0.3.19 Armada DM delivery diagnostics. Requires relay 0.7.1.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
cd "$(dirname "$0")"
archive=app-staging-0.3.19.tar.gz
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
release=/opt/bitcoinwalk-app-staging/releases/0.3.19

sha256sum -c "$archive.sha256"
test -f "$unit"
test ! -e "$release"
grep -qx 'WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.18' "$unit"
grep -qx 'Environment=BITCOINWALK_SERVER_READ_RELAY=ws://127.0.0.1:3334' "$unit"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3334/healthz >/dev/null
curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' http://127.0.0.1:3334/ | grep -q 'bitcoinwalk-organizers-0.7.1'
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.18"'

backup=$(mktemp -d /var/backups/bitcoinwalk-app-armada-dm.XXXXXX)
cp -p "$unit" "$backup/service.before"
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then
    cp -p "$backup/service.before" "$unit"
    systemctl daemon-reload
    systemctl restart bitcoinwalk-app-staging
    echo "Activation failed; previous app service restored. Backup: $backup" >&2
  fi
  exit "$code"
}
trap rollback EXIT

install -d -m 0755 "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/server.js"
test -f "$release/.next/BUILD_ID"
test ! -e "$release/.next/cache"
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"

sed 's@^WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.18$@WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.19@' "$unit" >"$backup/service.candidate"
grep -qx 'WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.19' "$backup/service.candidate"
grep -qx 'Environment=BITCOINWALK_SERVER_READ_RELAY=ws://127.0.0.1:3334' "$backup/service.candidate"
install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload
systemctl restart bitcoinwalk-app-staging

ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.19"'; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3338/admin/walks >"$backup/events-page.html"
grep -q 'BitcoinWalk dashboard' "$backup/events-page.html"
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3338/admin >"$backup/admin-page.html"
grep -q 'BitcoinWalk' "$backup/admin-page.html"

curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3338/organizer/team >"$backup/team-page.html"
grep -q 'Dashboard moved' "$backup/team-page.html"
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3338/admin/accept-invitation >"$backup/invitation-page.html"
grep -q 'Walk hosting invitation' "$backup/invitation-page.html"

trap - EXIT
echo "Staging 0.3.19 installed. Armada DM test controls are ready under /admin/walks. Relay permissions and data unchanged."
echo "Previous service unit: $backup/service.before"
echo "Previous release retained at /opt/bitcoinwalk-app-staging/releases/0.3.18"
