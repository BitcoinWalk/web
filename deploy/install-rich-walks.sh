#!/bin/sh
# Staging app 0.3.54 and organizer relay 0.8.7: Markdown descriptions and walk-level AllTrails routes.
set -eu
if [ "$(id -u)" -ne 0 ];then echo "Run this installer with sudo." >&2;exit 1;fi
cd "$(dirname "$0")"

archive=app-staging-0.3.54.tar.gz
relay_source=bitcoinwalk-relay-production-0.8.7
relay_sha=0064471c624f40068580a646e5e11e48beca3787c8ad7ce74746091f39de3aef
staging_old_sha=496ce7e687be6bb1b1ba8d48b813edcc50949ed70e1c74cabd1dcdb367d31b7a
production_old_sha=eb7a5bab1ff46639fa0aae5b8736d7a1bfb4ecebc27b41eb1d57032b4753aad3
staging_relay=/opt/bitcoinwalk-relay/bitcoinwalk-relay
production_relay=/opt/bitcoinwalk-relay-production/bitcoinwalk-relay
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
previous=/opt/bitcoinwalk-app-staging/releases/0.3.53
release=/opt/bitcoinwalk-app-staging/releases/0.3.54

sha256sum -c "$archive.sha256"
test "$(sha256sum "$relay_source"|cut -d ' ' -f 1)" = "$relay_sha"
test "$(sha256sum "$staging_relay"|cut -d ' ' -f 1)" = "$staging_old_sha"
test "$(sha256sum "$production_relay"|cut -d ' ' -f 1)" = "$production_old_sha"
test -f "$unit";test ! -e "$release"
grep -qx "WorkingDirectory=$previous" "$unit"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.53"'
systemctl is-active --quiet bitcoinwalk-relay.service
systemctl is-active --quiet bitcoinwalk-relay-production.service

backup=$(mktemp -d /var/backups/bitcoinwalk-rich-walks.XXXXXX)
cp -p "$unit" "$backup/service.before"
cp -p "$staging_relay" "$backup/relay-staging.before"
cp -p "$production_relay" "$backup/relay-production.before"
rollback(){
  code=$?;trap - EXIT
  if [ "$code" -ne 0 ];then
    cp -p "$backup/service.before" "$unit"
    install -m 0755 "$backup/relay-staging.before" "$staging_relay"
    install -m 0755 "$backup/relay-production.before" "$production_relay"
    systemctl daemon-reload
    systemctl restart bitcoinwalk-relay.service >/dev/null 2>&1||true
    systemctl restart bitcoinwalk-relay-production.service >/dev/null 2>&1||true
    systemctl restart bitcoinwalk-app-staging.service >/dev/null 2>&1||true
    echo "Activation failed; app and relay binaries restored. Backup: $backup" >&2
  fi
  exit "$code"
}
trap rollback EXIT

install -d -m 0755 "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/server.js";test -f "$release/.next/BUILD_ID";test ! -e "$release/.next/cache"
test -f "$release/node_modules/sharp/dist/index.cjs"
sharp_alias=$(find "$release/.next/node_modules" -maxdepth 1 -type l -name 'sharp-*' -print -quit)
test -n "$sharp_alias";test "$(readlink "$sharp_alias")" = '../../node_modules/sharp'
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
sed "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" "$unit">"$backup/service.candidate"
grep -qx "WorkingDirectory=$release" "$backup/service.candidate"

install -m 0755 "$relay_source" "$staging_relay"
install -m 0755 "$relay_source" "$production_relay"
install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload
systemctl restart bitcoinwalk-relay.service
systemctl restart bitcoinwalk-relay-production.service
systemctl restart bitcoinwalk-app-staging.service

check_relay(){
  port=$1;output=$2;ready=false
  for attempt in 1 2 3 4 5 6 7 8 9 10;do
    if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/healthz"|grep -q '"status":"ok"';then ready=true;break;fi
    sleep 1
  done
  test "$ready" = true
  curl --fail --silent --show-error --max-time 5 -H 'Accept: application/nostr+json' "http://127.0.0.1:$port/">"$output"
  grep -q 'bitcoinwalk-organizers-0.8.7' "$output"
}
check_relay 3334 "$backup/staging-nip11.json"
check_relay 3340 "$backup/production-nip11.json"
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10;do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.54"';then ready=true;break;fi
  sleep 1
done
test "$ready" = true
trap - EXIT
echo "Rich walk editing release installed: app 0.3.54 and organizer relays 0.8.7."
echo "Markdown descriptions and optional walk-level AllTrails routes are active."
echo "Databases, keys, media, credentials, Caddy and DNS were retained."
echo "Protected rollback backup: $backup"
