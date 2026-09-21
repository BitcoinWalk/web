#!/bin/sh
# Staging-only 0.3.7 app upgrade. Keeps the relay, Caddy and legacy hosts intact.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
cd "$(dirname "$0")"
archive=app-staging-0.3.7.tar.gz
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
release=/opt/bitcoinwalk-app-staging/releases/0.3.7
event=nevent1qvzqqqrukvpzq3gxup8ykureecr78r5cw4nc4qddxwj9d35k6uywlr569kxpdwsyqy3hwumn8ghj7un9d3shjttnw3skw6twvuhxy6t5vdhkjmnhv9kxktn0wfnsqg9xljsk47wq4v59k827nlvxypevhsk8t4u9hqh4t29sp9hx36m8tqq4m4pr

sha256sum -c "$archive.sha256"
test -f "$unit"
test ! -e "$release"
grep -qx 'WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.6' "$unit"
grep -qx 'Environment=NEXT_TELEMETRY_DISABLED=1' "$unit"
if grep -q '^Environment=BITCOINWALK_SERVER_READ_RELAY=' "$unit"; then
  echo "Private relay read setting already exists; stop for review." >&2
  exit 1
fi
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3334/healthz >/dev/null
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3338/api/healthz >/dev/null

backup=$(mktemp -d /var/backups/bitcoinwalk-app-private-read.XXXXXX)
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

sed -e 's@^WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.6$@WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.7@' \
  -e '/^Environment=NEXT_TELEMETRY_DISABLED=1$/a Environment=BITCOINWALK_SERVER_READ_RELAY=ws://127.0.0.1:3334' \
  "$unit" >"$backup/service.candidate"
grep -qx 'WorkingDirectory=/opt/bitcoinwalk-app-staging/releases/0.3.7' "$backup/service.candidate"
grep -qx 'Environment=BITCOINWALK_SERVER_READ_RELAY=ws://127.0.0.1:3334' "$backup/service.candidate"
install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload
systemctl restart bitcoinwalk-app-staging

ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz | grep -q '"release":"app-staging-0.3.7"'; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
curl --fail --silent --show-error --max-time 30 "http://127.0.0.1:3338/memphis/$event" >"$backup/memphis-check.html"
grep -q 'BitcoinWalk Memphis' "$backup/memphis-check.html"
if grep -q 'Event temporarily unavailable' "$backup/memphis-check.html"; then
  echo "Memphis relay read still failed." >&2
  exit 1
fi
curl --fail --silent --show-error --max-time 30 'http://127.0.0.1:3338/memphis' -L >"$backup/memphis-root-check.html"
grep -q 'BitcoinWalk Memphis' "$backup/memphis-root-check.html"

trap - EXIT
echo "Staging 0.3.7 installed; Memphis event and city root read through the private relay."
echo "Previous service unit: $backup/service.before"
echo "Previous release retained at /opt/bitcoinwalk-app-staging/releases/0.3.6"
