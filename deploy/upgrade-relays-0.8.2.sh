#!/bin/sh
# Upgrade staging and production organizer relays without changing their state.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
cd "$(dirname "$0")"

source_binary=$PWD/bitcoinwalk-relay-production-0.8.2
source_sha=75beeb6081384b81ff66b16ab22c1e1c422c513a7e5ef25d8f0a310e692a3cf3
old_sha=a58cf7272bc42b07b010725c912e30286a9e5684c5792aa69f2ee4ac631b4b80
staging=/opt/bitcoinwalk-relay/bitcoinwalk-relay
production=/opt/bitcoinwalk-relay-production/bitcoinwalk-relay

sha256sum "$source_binary" | grep -q "^$source_sha  $source_binary$"
sha256sum "$staging" | grep -q "^$old_sha  $staging$"
sha256sum "$production" | grep -q "^$old_sha  $production$"
systemctl is-active --quiet bitcoinwalk-relay.service
systemctl is-active --quiet bitcoinwalk-relay-production.service

backup=$(mktemp -d /var/backups/bitcoinwalk-relays-0.8.2.XXXXXX)
cp -p "$staging" "$backup/staging"
cp -p "$production" "$backup/production"
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then
    install -m 0755 "$backup/staging" "$staging"
    install -m 0755 "$backup/production" "$production"
    systemctl restart bitcoinwalk-relay.service >/dev/null 2>&1 || true
    systemctl restart bitcoinwalk-relay-production.service >/dev/null 2>&1 || true
    echo "Relay upgrade failed; both 0.8.1 binaries restored. Backup: $backup" >&2
  fi
  exit "$code"
}
trap rollback EXIT

install -m 0755 "$source_binary" "$staging"
install -m 0755 "$source_binary" "$production"
systemctl restart bitcoinwalk-relay.service
systemctl restart bitcoinwalk-relay-production.service

check_relay() {
  port=$1
  output=$2
  ready=false
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/healthz" | grep -q '"status":"ok"'; then
      ready=true
      break
    fi
    sleep 1
  done
  test "$ready" = true
  curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' "http://127.0.0.1:$port/" >"$output"
  grep -q 'bitcoinwalk-organizers-0.8.2' "$output"
}

check_relay 3334 "$backup/staging-nip11.json"
check_relay 3340 "$backup/production-nip11.json"

trap - EXIT
echo "Staging and production organizer relays upgraded to 0.8.2."
echo "Existing databases, units, Caddy, DNS and keys retained."
echo "Protected binary backups: $backup"
