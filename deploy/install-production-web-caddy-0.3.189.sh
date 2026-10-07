#!/bin/bash
# Privileged one-time Caddy preparation. Run only after the private app passes.
set -euo pipefail
umask 077

test "$(id -u)" -eq 0 || { echo 'Run with sudo on .138.' >&2; exit 1; }
script_dir=$(cd "$(dirname "$0")" && pwd)
fragment="$script_dir/Caddyfile.production-web"
live=/etc/caddy/Caddyfile
test -f "$fragment"
test -f "$live"
for host in directory.bitcoinwalk.org bitcoinwalk.org; do
  if grep -Eq "^${host//./\\.}([ ,{]|$)" "$live"; then echo "$host already exists in Caddyfile; refusing a duplicate block." >&2; exit 1; fi
done
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3345/api/healthz | grep -Fq '"release":"app-production-0.3.189"'

backup=$(mktemp -d /var/backups/bitcoinwalk-production-web.XXXXXX)
install -m 0600 "$live" "$backup/Caddyfile.before"
candidate="$backup/Caddyfile.candidate"
cp "$live" "$candidate"
printf '\n' >>"$candidate"
cat "$fragment" >>"$candidate"
caddy fmt --overwrite "$candidate"
caddy validate --config "$candidate" --adapter caddyfile
install -o root -g root -m 0644 "$candidate" "$live"
systemctl reload caddy
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3345/api/healthz >"$backup/app-health.json"
sha256sum "$fragment" "$live" >"$backup/accepted.sha256"
echo "Production web and primary-directory Caddy routes prepared. Backup: $backup"
echo 'No DNS record was changed by this installer.'
