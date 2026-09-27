#!/bin/sh
# App 0.3.55 and organizer relay 0.8.8: approved city aliases for directory search.
set -eu
if [ "$(id -u)" -ne 0 ];then echo "Run this installer with sudo." >&2;exit 1;fi
cd "$(dirname "$0")"
archive=app-staging-0.3.55.tar.gz
relay_source=bitcoinwalk-relay-production-0.8.8
relay_sha=d5b52d17b717b891c60b34c682e9576878645719b53c375ec1898c6f862bb79f
old_relay_sha=0064471c624f40068580a646e5e11e48beca3787c8ad7ce74746091f39de3aef
staging_relay=/opt/bitcoinwalk-relay/bitcoinwalk-relay
production_relay=/opt/bitcoinwalk-relay-production/bitcoinwalk-relay
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
previous=/opt/bitcoinwalk-app-staging/releases/0.3.54
release=/opt/bitcoinwalk-app-staging/releases/0.3.55
sha256sum -c "$archive.sha256"
test "$(sha256sum "$relay_source"|cut -d ' ' -f 1)" = "$relay_sha"
test "$(sha256sum "$staging_relay"|cut -d ' ' -f 1)" = "$old_relay_sha"
test "$(sha256sum "$production_relay"|cut -d ' ' -f 1)" = "$old_relay_sha"
test -f "$unit";test ! -e "$release";grep -qx "WorkingDirectory=$previous" "$unit"
curl --fail --silent --max-time 5 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.54"'
systemctl is-active --quiet bitcoinwalk-relay.service;systemctl is-active --quiet bitcoinwalk-relay-production.service
backup=$(mktemp -d /var/backups/bitcoinwalk-city-aliases.XXXXXX)
cp -p "$unit" "$backup/service.before";cp -p "$staging_relay" "$backup/relay-staging.before";cp -p "$production_relay" "$backup/relay-production.before"
rollback(){ code=$?;trap - EXIT;if [ "$code" -ne 0 ];then cp -p "$backup/service.before" "$unit";install -m 0755 "$backup/relay-staging.before" "$staging_relay";install -m 0755 "$backup/relay-production.before" "$production_relay";systemctl daemon-reload;systemctl restart bitcoinwalk-relay.service >/dev/null 2>&1||true;systemctl restart bitcoinwalk-relay-production.service >/dev/null 2>&1||true;systemctl restart bitcoinwalk-app-staging.service >/dev/null 2>&1||true;echo "Activation failed; app and relays restored. Backup: $backup" >&2;fi;exit "$code";}
trap rollback EXIT
install -d -m 0755 "$release";tar -xzf "$archive" -C "$release"
test -f "$release/server.js";test -f "$release/.next/BUILD_ID";test ! -e "$release/.next/cache";test -f "$release/node_modules/sharp/dist/index.cjs"
sharp_alias=$(find "$release/.next/node_modules" -maxdepth 1 -type l -name 'sharp-*' -print -quit);test -n "$sharp_alias";test "$(readlink "$sharp_alias")" = '../../node_modules/sharp'
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
sed "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" "$unit">"$backup/service.candidate";grep -qx "WorkingDirectory=$release" "$backup/service.candidate"
install -m 0755 "$relay_source" "$staging_relay";install -m 0755 "$relay_source" "$production_relay";install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload;systemctl restart bitcoinwalk-relay.service;systemctl restart bitcoinwalk-relay-production.service;systemctl restart bitcoinwalk-app-staging.service
check_relay(){ port=$1;ready=false;for attempt in 1 2 3 4 5 6 7 8 9 10;do if curl --fail --silent --max-time 3 "http://127.0.0.1:$port/healthz"|grep -q '"status":"ok"';then ready=true;break;fi;sleep 1;done;test "$ready" = true;curl --fail --silent --max-time 5 -H 'Accept: application/nostr+json' "http://127.0.0.1:$port/"|grep -q 'bitcoinwalk-organizers-0.8.8';}
check_relay 3334;check_relay 3340
ready=false;for attempt in 1 2 3 4 5 6 7 8 9 10;do if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.55"';then ready=true;break;fi;sleep 1;done;test "$ready" = true
trap - EXIT
echo "City aliases installed: app 0.3.55 and organizer relays 0.8.8."
echo "Existing cities remain compatible; databases, keys, media, Caddy and DNS were retained."
echo "Protected rollback backup: $backup"
