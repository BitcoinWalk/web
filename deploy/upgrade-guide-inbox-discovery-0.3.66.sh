#!/bin/sh
# Merge verified signed inbox preferences from each discovery relay that
# completes; one unavailable discovery relay cannot block an allowed inbox.
set -eu
test "$(id -u)" -eq 0||{ echo 'Run with sudo.' >&2;exit 1; }
cd "$(dirname "$0")/.."
artifact=bitcoinwalk-guide-replication-alerts-0.3.66.cjs
manifest=GUIDE-INBOX-DISCOVERY-0.3.66-SHA256SUMS
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
accepted_bundle=931114f7defa11a271b69c10c7d185dfc3dcd5f00cc960dce55d25845b428963
accepted_config=d70ac371a41238a24dcd603a57a72b83bd90bb4e990905293e0f1cc05e749455
digest(){ sha256sum "$1"|cut -d ' ' -f 1; }
summary(){ /opt/bitcoinwalk-app-staging/runtime/bin/node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT purpose,state,count(*) AS count FROM delivery GROUP BY purpose,state ORDER BY purpose,state").all()));db.close();' "$state/guide.sqlite"; }

sha256sum -c "$manifest"
test "$(digest "$target")" = "$accepted_bundle"
test "$(digest "$config")" = "$accepted_config"
for unit in bitcoinwalk-guide bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done
test "$(/opt/bitcoinwalk-app-staging/runtime/bin/node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare("SELECT count(*) AS n FROM delivery WHERE purpose=? AND state=?").get("live","pending").n);db.close();' "$state/guide.sqlite")" = 1

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-inbox-discovery.XXXXXX);chmod 0700 "$backup"
systemctl stop bitcoinwalk-guide.service
cp -p "$target" "$backup/guide.cjs.before"
cp -p "$config" "$backup/config.json"
cp -aL "$state" "$backup/guide-state"
(
 cd "$backup";sha256sum guide.cjs.before config.json >SHA256SUMS
 find guide-state -type f -exec sha256sum '{}' + >>SHA256SUMS
)
echo "Consistent pre-upgrade Guide backup created: $backup"
changed=0
completed=0
rollback(){
 code=$?;trap - EXIT
 if [ "$code" -ne 0 ]&&[ "$changed" -eq 1 ];then
  systemctl stop bitcoinwalk-guide.service 2>/dev/null||true
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1||true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1||true
  echo "Guide 0.3.66 activation failed; prior bundle restored without overwriting durable state. Backup: $backup" >&2
 fi
 if [ "$completed" -ne 1 ];then echo 'Guide inbox-discovery upgrade did not complete.' >&2;fi
 exit "$code"
}
trap rollback EXIT

changed=1
install -o root -g root -m 0644 "$artifact" "$target"
# Retry the one exact persisted event now; do not replace its wrapper or reset attempts.
/opt/bitcoinwalk-app-staging/runtime/bin/node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);db.prepare("UPDATE delivery SET next_attempt=0 WHERE purpose=? AND state=?").run("live","pending");db.close();' "$state/guide.sqlite"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service
sleep 15
systemctl is-active --quiet bitcoinwalk-guide.service
for unit in bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done
echo 'Queue summary after exact-event retry:';summary

completed=1
trap - EXIT
echo "Guide signed-inbox discovery 0.3.66 activated. Backup: $backup"
echo 'If delivery remains pending, inspect the fixed publication category in the Guide journal; no relay-provided text is logged.'
