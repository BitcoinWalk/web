#!/bin/sh
# Resume the interrupted 0.3.62 coordinated activation with a corrected Guide
# bundle. The app is already accepted on 0.3.62; do not mutate relay state.
set -eu

test "$(id -u)" -eq 0||{ echo 'Run with sudo.' >&2;exit 1; }
cd "$(dirname "$0")/.."
artifact=bitcoinwalk-guide-replication-alerts-0.3.63.cjs
manifest=GUIDE-REPLICATION-ALERTS-RESUME-0.3.63-SHA256SUMS
target=/opt/bitcoinwalk-guide/guide.cjs
app_unit=/etc/systemd/system/bitcoinwalk-app-staging.service
guide_unit=/etc/systemd/system/bitcoinwalk-guide.service
guide_config=/etc/bitcoinwalk-guide/config.json
guide_state=/var/lib/bitcoinwalk-guide
partial_bundle=3816d14057c99eb3d6b76bf7eb89b04ee58bdc9a096dc686bc790a1e2a91ddd8
partial_app_unit=0738619fd1fcb808a55320eec1aa23b5528dca6b5a90cdd9c4387d3d9d8db887
accepted_guide_unit=4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
accepted_guide_config=6cb189106f6a51f07de6578d289c9b42ff655060c7ec00a76b1e5cfb691a23e0
digest(){ sha256sum "$1"|cut -d ' ' -f 1; }
queue_summary(){
 /opt/bitcoinwalk-app-staging/runtime/bin/node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT purpose,state,count(*) AS count FROM delivery GROUP BY purpose,state ORDER BY purpose,state").all()));db.close();' "$guide_state/guide.sqlite"
}

sha256sum -c "$manifest"
test "$(digest "$target")" = "$partial_bundle"
test "$(digest "$app_unit")" = "$partial_app_unit"
test "$(digest "$guide_unit")" = "$accepted_guide_unit"
test "$(digest "$guide_config")" = "$accepted_guide_config"
systemctl is-active --quiet bitcoinwalk-app-staging.service
systemctl is-active --quiet bitcoinwalk-relay.service
systemctl is-active --quiet bitcoinwalk-replica-rehearsal.service
systemctl is-active --quiet bitcoinwalk-replica-firstwalk.service
systemctl is-active --quiet caddy.service
! systemctl is-active --quiet bitcoinwalk-guide.service
curl --fail --silent --max-time 5 http://127.0.0.1:3338/api/healthz|grep -q '"release":"app-staging-0.3.62"'

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-replication-alerts-resume.XXXXXX);chmod 0700 "$backup"
cp -p "$target" "$backup/guide.cjs.partial"
cp -aL "$guide_state" "$backup/guide-state"
(
 cd "$backup";sha256sum guide.cjs.partial >SHA256SUMS
 find guide-state -type f -exec sha256sum '{}' + >>SHA256SUMS
)
echo "Consistent interrupted-state backup created: $backup"
changed=0
completed=0
rollback(){
 code=$?;trap - EXIT
 if [ "$code" -ne 0 ]&&[ "$changed" -eq 1 ];then
  systemctl stop bitcoinwalk-guide.service 2>/dev/null||true
  install -o root -g root -m 0644 "$backup/guide.cjs.partial" "$target"
  echo "Guide resume failed; the partial bundle was restored and Guide remains stopped. Durable state was not overwritten. Backup: $backup" >&2
 fi
 if [ "$completed" -ne 1 ];then echo 'Guide replication Alerts resume did not complete.' >&2;fi
 exit "$code"
}
trap rollback EXIT

echo 'Queue summary before resume:';queue_summary
changed=1
install -o root -g root -m 0644 "$artifact" "$target"
guide_pubkey=$(GUIDE_CONFIG="$guide_config" CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$guide_state" /opt/bitcoinwalk-app-staging/runtime/bin/node "$target" --print-identity)
printf '%s' "$guide_pubkey"|grep -Eq '^[0-9a-f]{64}$'
grep -qx "Environment=BITCOINWALK_GUIDE_PUBKEY=$guide_pubkey" "$app_unit"
GUIDE_CONFIG="$guide_config" CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$guide_state" /opt/bitcoinwalk-app-staging/runtime/bin/node "$target" --check-replication
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service
sleep 5
systemctl is-active --quiet bitcoinwalk-guide.service
for unit in bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done
echo 'Queue summary after resume:';queue_summary

completed=1
trap - EXIT
echo "Guide replication Alerts resume accepted with corrected bundle 0.3.63. Backup: $backup"
echo 'The app remains 0.3.62; relay and replica state were not changed.'
