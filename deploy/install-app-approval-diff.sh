#!/bin/sh
# Staging app 0.3.56: complete field-level city revision review.
set -eu
if [ "$(id -u)" -ne 0 ];then echo "Run this installer with sudo." >&2;exit 1;fi
cd "$(dirname "$0")"
archive=app-staging-0.3.56.tar.gz
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
previous=/opt/bitcoinwalk-app-staging/releases/0.3.55
release=/opt/bitcoinwalk-app-staging/releases/0.3.56
sha256sum -c "$archive.sha256"
test -f "$unit";test ! -e "$release";grep -qx "WorkingDirectory=$previous" "$unit"
curl --fail --silent --max-time 5 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.55"'
backup=$(mktemp -d /var/backups/bitcoinwalk-approval-diff.XXXXXX);cp -p "$unit" "$backup/service.before"
rollback(){ code=$?;trap - EXIT;if [ "$code" -ne 0 ];then cp -p "$backup/service.before" "$unit";systemctl daemon-reload;systemctl restart bitcoinwalk-app-staging.service >/dev/null 2>&1||true;echo "Activation failed; previous app restored. Backup: $backup" >&2;fi;exit "$code";}
trap rollback EXIT
install -d -m 0755 "$release";tar -xzf "$archive" -C "$release"
test -f "$release/server.js";test -f "$release/.next/BUILD_ID";test ! -e "$release/.next/cache";test -f "$release/node_modules/sharp/dist/index.cjs"
sharp_alias=$(find "$release/.next/node_modules" -maxdepth 1 -type l -name 'sharp-*' -print -quit);test -n "$sharp_alias";test "$(readlink "$sharp_alias")" = '../../node_modules/sharp'
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
sed "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" "$unit">"$backup/service.candidate";grep -qx "WorkingDirectory=$release" "$backup/service.candidate"
install -m 0644 "$backup/service.candidate" "$unit";systemctl daemon-reload;systemctl restart bitcoinwalk-app-staging.service
ready=false;for attempt in 1 2 3 4 5 6 7 8 9 10;do if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.56"';then ready=true;break;fi;sleep 1;done;test "$ready" = true
trap - EXIT
echo "Staging 0.3.56 installed with complete city revision comparisons."
echo "Relays, databases, keys, media, Caddy and DNS were unchanged."
echo "Protected service backup: $backup/service.before"
