#!/bin/sh
# Permit validated managed-image overrides on individual organizer occurrences.
set -eu
if [ "$(id -u)" -ne 0 ]; then echo "Run this installer with sudo." >&2; exit 1; fi
cd "$(dirname "$0")"
source_binary=$PWD/bitcoinwalk-relay-production-0.8.4
source_sha=eb7a5bab1ff46639fa0aae5b8736d7a1bfb4ecebc27b41eb1d57032b4753aad3
old_sha=6cf0e844af71b1aff814f097e40fac0b3c46e2d58978c7fabe3041c0517fe17c
staging=/opt/bitcoinwalk-relay/bitcoinwalk-relay
production=/opt/bitcoinwalk-relay-production/bitcoinwalk-relay
sha256sum "$source_binary" | grep -q "^$source_sha  $source_binary$"
sha256sum "$staging" | grep -q "^$old_sha  $staging$"
sha256sum "$production" | grep -q "^$old_sha  $production$"
systemctl is-active --quiet bitcoinwalk-relay.service
systemctl is-active --quiet bitcoinwalk-relay-production.service
backup=$(mktemp -d /var/backups/bitcoinwalk-relays-0.8.4.XXXXXX)
cp -p "$staging" "$backup/staging";cp -p "$production" "$backup/production"
rollback(){ code=$?;trap - EXIT;if [ "$code" -ne 0 ];then install -m 0755 "$backup/staging" "$staging";install -m 0755 "$backup/production" "$production";systemctl restart bitcoinwalk-relay.service >/dev/null 2>&1||true;systemctl restart bitcoinwalk-relay-production.service >/dev/null 2>&1||true;echo "Relay upgrade failed; both 0.8.3 binaries restored. Backup: $backup" >&2;fi;exit "$code";}
trap rollback EXIT
install -m 0755 "$source_binary" "$staging";install -m 0755 "$source_binary" "$production"
systemctl restart bitcoinwalk-relay.service;systemctl restart bitcoinwalk-relay-production.service
check(){ port=$1;output=$2;ready=false;for attempt in 1 2 3 4 5 6 7 8 9 10;do if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/healthz"|grep -q '"status":"ok"';then ready=true;break;fi;sleep 1;done;test "$ready" = true;curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' "http://127.0.0.1:$port/" >"$output";grep -q 'bitcoinwalk-organizers-0.8.4' "$output";}
check 3334 "$backup/staging-nip11.json";check 3340 "$backup/production-nip11.json"
trap - EXIT
echo "Staging and production organizer relays upgraded to 0.8.4."
echo "Existing databases, units, Caddy, DNS and keys retained."
echo "Protected binary backups: $backup"
