#!/bin/sh
# Move only the staging app's city-directory discovery defaults from optional
# third-party transports to the two accepted BitcoinWalk-operated transports.
set -eu
test "$(id -u)" -eq 0 || { echo 'Run with sudo.' >&2; exit 1; }
cd "$(dirname "$0")/.."

archive=app-staging-0.3.71.tar.gz
manifest=CITY-DIRECTORY-FIRST-PARTY-0.3.71-SHA256SUMS
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
previous=/opt/bitcoinwalk-app-staging/releases/0.3.70
release=/opt/bitcoinwalk-app-staging/releases/0.3.71
primary=wss://directory-staging.bitcoinwalk.org/
secondary=wss://directory-2-staging.bitcoinwalk.org/

sha256sum -c "$manifest"
test -f "$unit";test ! -e "$release";grep -qx "WorkingDirectory=$previous" "$unit"
curl --fail --silent --max-time 5 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.70"'
for endpoint in https://directory-staging.bitcoinwalk.org/ https://directory-2-staging.bitcoinwalk.org/;do
 curl --fail --silent --show-error --max-time 10 -H 'Accept: application/nostr+json' "$endpoint"|grep -q 'BitcoinWalk staging directory relay'
done
for service in bitcoinwalk-app-staging bitcoinwalk-guide bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$service";done

backup=$(mktemp -d /var/backups/bitcoinwalk-city-directory-first-party.XXXXXX);chmod 0700 "$backup"
cp -p "$unit" "$backup/service.before";sha256sum "$backup/service.before">"$backup/SHA256SUMS"
changed=0;completed=0
rollback(){ code=$?;trap - EXIT;if [ "$code" -ne 0 ]&&[ "$changed" -eq 1 ];then install -o root -g root -m 0644 "$backup/service.before" "$unit";systemctl daemon-reload;systemctl reset-failed bitcoinwalk-app-staging.service >/dev/null 2>&1||true;systemctl restart bitcoinwalk-app-staging.service >/dev/null 2>&1||true;echo "0.3.71 activation failed; app 0.3.70 was restored. Backup: $backup" >&2;fi;if [ "$completed" -ne 1 ];then echo 'First-party directory app activation did not complete.' >&2;fi;exit "$code"; }
trap rollback EXIT
echo "Consistent pre-activation app service backup created: $backup"

install -d -m 0755 "$release";tar -xzf "$archive" -C "$release"
test -f "$release/server.js";test -f "$release/.next/BUILD_ID";test ! -e "$release/.next/cache";test -f "$release/node_modules/sharp/dist/index.cjs"
sharp_alias=$(find "$release/.next/node_modules" -maxdepth 1 -type l -name 'sharp-*' -print -quit);test -n "$sharp_alias";test "$(readlink "$sharp_alias")" = '../../node_modules/sharp'
grep -Rqs "$primary" "$release/.next/static"
grep -Rqs "$secondary" "$release/.next/static"
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"

sed "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" "$unit">"$backup/bitcoinwalk-app-staging.service"
grep -qx "WorkingDirectory=$release" "$backup/bitcoinwalk-app-staging.service";systemd-analyze verify "$backup/bitcoinwalk-app-staging.service" >/dev/null
changed=1;install -o root -g root -m 0644 "$backup/bitcoinwalk-app-staging.service" "$unit";systemctl daemon-reload;systemctl restart bitcoinwalk-app-staging.service
ready=false;for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15;do if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.71"';then ready=true;break;fi;sleep 1;done;test "$ready" = true
curl --fail --silent --max-time 5 http://127.0.0.1:3338/admin/directory|grep -q 'Welcome to your dashboard!'
for service in bitcoinwalk-app-staging bitcoinwalk-guide bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$service";done
completed=1;trap - EXIT
echo "BitcoinWalk-owned directory defaults accepted on app 0.3.71. Backup: $backup"
echo "Discovery transports: $primary and $secondary"
echo 'No directory root, Guide, relay, replica, database, key, Caddy or DNS state was changed by this installer.'
