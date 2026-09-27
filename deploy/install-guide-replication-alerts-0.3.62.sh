#!/bin/sh
# Upgrade the staging app and existing Guide together so the Guide can request
# only the strict content-free replication report and durably notify organizers.
set -eu

test "$(id -u)" -eq 0 || { echo 'Run with sudo.' >&2; exit 1; }
cd "$(dirname "$0")/.."

archive=app-staging-0.3.62.tar.gz
guide_artifact=bitcoinwalk-guide-replication-alerts-0.3.62.cjs
manifest=GUIDE-REPLICATION-ALERTS-0.3.62-SHA256SUMS
app_unit=/etc/systemd/system/bitcoinwalk-app-staging.service
guide_unit=/etc/systemd/system/bitcoinwalk-guide.service
guide_target=/opt/bitcoinwalk-guide/guide.cjs
guide_config=/etc/bitcoinwalk-guide/config.json
guide_key=/etc/bitcoinwalk-guide/guide-key
guide_state=/var/lib/bitcoinwalk-guide
previous_release=/opt/bitcoinwalk-app-staging/releases/0.3.61
release=/opt/bitcoinwalk-app-staging/releases/0.3.62
accepted_app_unit=03667ff85b8fc8ab53335e3742d3a689f5bba37c5c5d082a7decd2f0b7427ef2
accepted_guide=717b972432fe1fcb6fca72a0a3249d0f7254b2a56b548412c464b5a02f3d78dd
accepted_guide_unit=4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
accepted_guide_config=6cb189106f6a51f07de6578d289c9b42ff655060c7ec00a76b1e5cfb691a23e0

digest(){ sha256sum "$1"|cut -d ' ' -f 1; }
wait_app(){
 attempt=0
 until curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.62"';do
  attempt=$((attempt+1));test "$attempt" -lt 25||return 1;sleep 1
 done
}

sha256sum -c "$manifest"
test "$(digest "$app_unit")" = "$accepted_app_unit"
test "$(digest "$guide_target")" = "$accepted_guide"
test "$(digest "$guide_unit")" = "$accepted_guide_unit"
test "$(digest "$guide_config")" = "$accepted_guide_config"
test -f "$guide_key";test ! -e "$release"
grep -qx "WorkingDirectory=$previous_release" "$app_unit"
! grep -q '^Environment=BITCOINWALK_GUIDE_PUBKEY=' "$app_unit"
curl --fail --silent --max-time 5 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.61"'
for unit in bitcoinwalk-guide bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-replication-alerts.XXXXXX)
chmod 0700 "$backup"
changed=0
completed=0
rollback(){
 code=$?;trap - EXIT
 if [ "$code" -ne 0 ]&&[ "$changed" -eq 1 ];then
  systemctl stop bitcoinwalk-guide.service bitcoinwalk-app-staging.service 2>/dev/null||true
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$guide_target"
  install -o root -g root -m 0644 "$backup/app-service.before" "$app_unit"
  systemctl daemon-reload
  systemctl reset-failed bitcoinwalk-app-staging.service bitcoinwalk-guide.service >/dev/null 2>&1||true
  systemctl start bitcoinwalk-app-staging.service >/dev/null 2>&1||true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1||true
  echo "Guide replication Alerts activation failed; app 0.3.61 and the accepted Guide bundle were restored. Durable Guide state was not overwritten. Backup: $backup" >&2
 fi
 if [ "$completed" -ne 1 ];then echo 'Guide replication notification activation did not complete.' >&2;fi
 exit "$code"
}
trap rollback EXIT

systemctl stop bitcoinwalk-guide.service bitcoinwalk-app-staging.service
cp -p "$app_unit" "$backup/app-service.before"
cp -p "$guide_target" "$backup/guide.cjs.before"
cp -p "$guide_unit" "$backup/guide-service.before"
cp -p "$guide_config" "$backup/config.json"
cp -aL "$guide_state" "$backup/guide-state"
(
 cd "$backup"
 sha256sum app-service.before guide.cjs.before guide-service.before config.json >SHA256SUMS
 find guide-state -type f -exec sha256sum '{}' + >>SHA256SUMS
)
echo "Consistent pre-activation app and Guide backup created: $backup"

changed=1
install -d -m 0755 "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/server.js";test -f "$release/.next/BUILD_ID";test ! -e "$release/.next/cache";test -f "$release/node_modules/sharp/dist/index.cjs"
sharp_alias=$(find "$release/.next/node_modules" -maxdepth 1 -type l -name 'sharp-*' -print -quit)
test -n "$sharp_alias";test "$(readlink "$sharp_alias")" = '../../node_modules/sharp'
ln -s /var/cache/bitcoinwalk-app-staging "$release/.next/cache"
install -o root -g root -m 0644 "$guide_artifact" "$guide_target"

guide_pubkey=$(GUIDE_CONFIG="$guide_config" CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$guide_state" /opt/bitcoinwalk-app-staging/runtime/bin/node "$guide_target" --print-identity)
printf '%s' "$guide_pubkey"|grep -Eq '^[0-9a-f]{64}$'
sed -e "s@^WorkingDirectory=$previous_release\$@WorkingDirectory=$release@" \
 -e "/^Environment=REPLICATION_STATUS_TOKEN_FILE=/a Environment=BITCOINWALK_GUIDE_PUBKEY=$guide_pubkey" \
 "$app_unit">"$backup/bitcoinwalk-app-staging.service"
grep -qx "WorkingDirectory=$release" "$backup/bitcoinwalk-app-staging.service"
grep -qx "Environment=BITCOINWALK_GUIDE_PUBKEY=$guide_pubkey" "$backup/bitcoinwalk-app-staging.service"
systemd-analyze verify "$backup/bitcoinwalk-app-staging.service" >/dev/null
install -o root -g root -m 0644 "$backup/bitcoinwalk-app-staging.service" "$app_unit"
systemctl daemon-reload
systemctl start bitcoinwalk-app-staging.service
wait_app

test "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3338/api/replication/status)" = 403
GUIDE_CONFIG="$guide_config" CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$guide_state" /opt/bitcoinwalk-app-staging/runtime/bin/node "$guide_target" --check-replication
systemctl start bitcoinwalk-guide.service
sleep 3
systemctl is-active --quiet bitcoinwalk-guide.service
for unit in bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done

completed=1
trap - EXIT
echo "Guide replication Alerts transport accepted on app 0.3.62. Backup: $backup"
echo 'The Guide has no relay status token. Its existing identity is pinned for one signed content-free read action.'
echo 'Healthy state was eligible only for baseline; no historical replication DM was intentionally queued.'
