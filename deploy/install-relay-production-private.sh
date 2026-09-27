#!/bin/sh
# Install an isolated production organizer/events relay on loopback only.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
cd "$(dirname "$0")"

source_binary=$PWD/bitcoinwalk-relay-production-0.8.1
source_sha=a58cf7272bc42b07b010725c912e30286a9e5684c5792aa69f2ee4ac631b4b80
target_dir=/opt/bitcoinwalk-relay-production
target_binary=$target_dir/bitcoinwalk-relay
unit=/etc/systemd/system/bitcoinwalk-relay-production.service

sha256sum "$source_binary" | grep -q "^$source_sha  $source_binary$"
test ! -e "$unit"
test ! -e "$target_dir"
test ! -e /var/lib/bitcoinwalk-relay-production/events.db
if ss -ltn '( sport = :3340 )' | grep -q LISTEN; then
  echo "Loopback port 3340 is already in use; nothing installed." >&2
  exit 1
fi

backup=$(mktemp -d /var/backups/bitcoinwalk-relay-production-install.XXXXXX)
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then
    systemctl disable --now bitcoinwalk-relay-production.service >/dev/null 2>&1 || true
    echo "Install failed; production relay stopped. Files retained for diagnosis. Backup: $backup" >&2
  fi
  exit "$code"
}
trap rollback EXIT

install -d -m 0755 "$target_dir"
install -m 0755 "$source_binary" "$target_binary"
sha256sum "$target_binary" | grep -q "^$source_sha  $target_binary$"
install -m 0644 bitcoinwalk-relay-production.service "$unit"
systemctl daemon-reload
systemctl enable --now bitcoinwalk-relay-production.service

ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3340/healthz | grep -q '"status":"ok"'; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' http://127.0.0.1:3340/ >"$backup/nip11.json"
grep -q 'bitcoinwalk-organizers-0.8.1' "$backup/nip11.json"
grep -q 'BitcoinWalk production events relay' "$backup/nip11.json"
ss -ltn '( sport = :3340 )' | grep -q '127.0.0.1:3340'

trap - EXIT
echo "Production free-city relay backend is healthy on 127.0.0.1:3340."
echo "Database: /var/lib/bitcoinwalk-relay-production/events.db"
echo "No Caddy, DNS, staging relay, chat relay or application configuration changed."
echo "Next: create explicit A record relay.bitcoinwalk.org -> 213.232.235.138, then run the HTTPS installer."
