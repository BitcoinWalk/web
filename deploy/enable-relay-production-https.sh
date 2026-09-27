#!/bin/sh
# Add only relay.bitcoinwalk.org to the existing Caddy configuration.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
cd "$(dirname "$0")"

caddyfile=/etc/caddy/Caddyfile
service=bitcoinwalk-relay-production.service
host=relay.bitcoinwalk.org
expected_ip=213.232.235.138

test -f "$caddyfile"
systemctl is-active --quiet "$service"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3340/healthz | grep -q '"status":"ok"'
if grep -q '^relay\.bitcoinwalk\.org {' "$caddyfile"; then
  echo "Caddy already contains relay.bitcoinwalk.org; stop for review." >&2
  exit 1
fi
resolved=$(getent ahostsv4 "$host" | awk '{print $1}' | sort -u)
if ! printf '%s\n' "$resolved" | grep -qx "$expected_ip"; then
  echo "$host does not resolve to $expected_ip. Current IPv4 results: ${resolved:-none}" >&2
  exit 1
fi

backup=$(mktemp -d /var/backups/bitcoinwalk-relay-production-https.XXXXXX)
cp -p "$caddyfile" "$backup/Caddyfile"
cp "$caddyfile" "$backup/Caddyfile.candidate"
cat relay-production.caddy >>"$backup/Caddyfile.candidate"
caddy validate --config "$backup/Caddyfile.candidate" --adapter caddyfile

rollback() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then
    cp -p "$backup/Caddyfile" "$caddyfile"
    systemctl reload caddy >/dev/null 2>&1 || true
    echo "HTTPS activation failed; previous Caddyfile restored. Backup: $backup" >&2
  fi
  exit "$code"
}
trap rollback EXIT

install -m 0644 "$backup/Caddyfile.candidate" "$caddyfile"
systemctl reload caddy

ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl --fail --silent --show-error --max-time 5 "https://$host/healthz" | grep -q '"status":"ok"'; then
    ready=true
    break
  fi
  sleep 5
done
test "$ready" = true
curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' "https://$host/" >"$backup/nip11-public.json"
grep -q 'bitcoinwalk-organizers-0.8.1' "$backup/nip11-public.json"
grep -q 'BitcoinWalk production events relay' "$backup/nip11-public.json"

trap - EXIT
echo "Production free-city relay is live at wss://relay.bitcoinwalk.org."
echo "Protected Caddy backup: $backup/Caddyfile"
echo "Staging relay, chat, city relays, app and legacy hostnames were unchanged."
