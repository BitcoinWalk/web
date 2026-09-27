#!/bin/sh
# Staging-only 0.3.49: guarded GPT Image city-landscape generation.
set -eu
if [ "$(id -u)" -ne 0 ];then echo "Run this installer with sudo." >&2;exit 1;fi
cd "$(dirname "$0")"
archive=app-staging-0.3.49.tar.gz
unit=/etc/systemd/system/bitcoinwalk-app-staging.service
credential=/etc/bitcoinwalk-app-staging/openai-api-key
release=/opt/bitcoinwalk-app-staging/releases/0.3.49
sha256sum -c "$archive.sha256";test -f "$unit";test ! -e "$release";test -s "$credential"
health=$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3338/api/healthz)
case "$health" in *'"release":"app-staging-0.3.47"'*) previous_version=0.3.47;; *'"release":"app-staging-0.3.48"'*) previous_version=0.3.48;; *) echo "Expected healthy staging 0.3.47 or 0.3.48." >&2;exit 1;; esac
previous=/opt/bitcoinwalk-app-staging/releases/$previous_version
grep -qx "WorkingDirectory=$previous" "$unit";grep -qx 'StateDirectory=bitcoinwalk-app-media' "$unit"
backup=$(mktemp -d /var/backups/bitcoinwalk-app-image-generation.XXXXXX);cp -p "$unit" "$backup/service.before"
rollback(){ code=$?;trap - EXIT;if [ "$code" -ne 0 ];then cp -p "$backup/service.before" "$unit";systemctl daemon-reload;systemctl restart bitcoinwalk-app-staging;echo "Activation failed; previous app service restored. Backup: $backup" >&2;fi;exit "$code";}
trap rollback EXIT
install -d -m 0755 "$release";tar -xzf "$archive" -C "$release"
test -f "$release/server.js";test -f "$release/.next/BUILD_ID";test ! -e "$release/.next/cache";test -f "$release/node_modules/sharp/dist/index.cjs"
sharp_alias=$(find "$release/.next/node_modules" -maxdepth 1 -type l -name 'sharp-*' -print -quit);test -n "$sharp_alias";test "$(readlink "$sharp_alias")" = '../../node_modules/sharp'
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
sed "s@^WorkingDirectory=$previous\$@WorkingDirectory=$release@" "$unit">"$backup/service.candidate"
sed -i '/^DynamicUser=yes$/a LoadCredential=openai-api-key:/etc/bitcoinwalk-app-staging/openai-api-key' "$backup/service.candidate"
sed -i '/^Environment=BITCOINWALK_MEDIA_PUBLIC_ORIGIN=/a Environment=OPENAI_API_KEY_FILE=%d/openai-api-key\nEnvironment=BITCOINWALK_IMAGE_MODEL=gpt-image-2.5-flare\nEnvironment=BITCOINWALK_IMAGE_DAILY_LIMIT=10' "$backup/service.candidate"
grep -qx "WorkingDirectory=$release" "$backup/service.candidate";grep -qx 'LoadCredential=openai-api-key:/etc/bitcoinwalk-app-staging/openai-api-key' "$backup/service.candidate";grep -qx 'Environment=OPENAI_API_KEY_FILE=%d/openai-api-key' "$backup/service.candidate"
install -m 0644 "$backup/service.candidate" "$unit"
systemctl daemon-reload;systemctl restart bitcoinwalk-app-staging
ready=false;for attempt in 1 2 3 4 5 6 7 8 9 10;do if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.49"';then ready=true;break;fi;sleep 1;done;test "$ready" = true
trap - EXIT
echo "Staging 0.3.49 installed with guarded city-landscape generation."
echo "The API credential was loaded by systemd and was not copied into the release."
echo "Daily provider-request limit: 10. Protected service backup: $backup/service.before"
