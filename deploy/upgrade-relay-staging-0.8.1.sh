#!/bin/sh
# Upgrade the existing staging organizer relay policy without changing its state.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
cd "$(dirname "$0")"

source_binary=$PWD/bitcoinwalk-relay-production-0.8.1
source_sha=a58cf7272bc42b07b010725c912e30286a9e5684c5792aa69f2ee4ac631b4b80
target=/opt/bitcoinwalk-relay/bitcoinwalk-relay
old_sha=2839141acff2eb624e93bbb045d1615e6f4c62f51c7cffc88b852984aee774cc
service=bitcoinwalk-relay.service

sha256sum "$source_binary" | grep -q "^$source_sha  $source_binary$"
sha256sum "$target" | grep -q "^$old_sha  $target$"
systemctl is-active --quiet "$service"

backup=$(mktemp -d /var/backups/bitcoinwalk-relay-0.8.1.XXXXXX)
cp -p "$target" "$backup/bitcoinwalk-relay"
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then
    install -m 0755 "$backup/bitcoinwalk-relay" "$target"
    systemctl restart "$service" >/dev/null 2>&1 || true
    echo "Staging relay upgrade failed; old binary restored. Backup: $backup" >&2
  fi
  exit "$code"
}
trap rollback EXIT

install -m 0755 "$source_binary" "$target"
systemctl restart "$service"
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3334/healthz | grep -q '"status":"ok"'; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' http://127.0.0.1:3334/ >"$backup/nip11.json"
grep -q 'bitcoinwalk-organizers-0.8.1' "$backup/nip11.json"

trap - EXIT
echo "Staging organizer relay upgraded to 0.8.1. Existing database, unit, Caddy and keys retained."
echo "Protected binary backup: $backup/bitcoinwalk-relay"
