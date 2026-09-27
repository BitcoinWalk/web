#!/bin/sh
# Re-publish one already-acknowledged live notification using its exact persisted
# gift-wrap ID after re-validating the recipient's signed, allowlisted inbox.
set -eu
test "$(id -u)" -eq 0||{ echo 'Run with sudo.' >&2;exit 1; }
cd "$(dirname "$0")/.."
artifact=bitcoinwalk-guide-replication-alerts-0.3.67.cjs
manifest=GUIDE-EXACT-RETRY-0.3.67-SHA256SUMS
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
submission=live:b2ff49826359923b6e5dc75f079576793635b4c44b2252a765e70412eb036965
recipient=4506e04e4b7079ce07e38e9875678a81ad33a456c696d708ef8e9a2d8c16ba04
accepted_bundle=0bd606cb7200d895ff89607ac6023579ddf57ad6de4abde34d60cef90ac16a3b
accepted_config=d70ac371a41238a24dcd603a57a72b83bd90bb4e990905293e0f1cc05e749455
digest(){ sha256sum "$1"|cut -d ' ' -f 1; }

sha256sum -c "$manifest"
test "$(digest "$target")" = "$accepted_bundle"
test "$(digest "$config")" = "$accepted_config"
for unit in bitcoinwalk-guide bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done
test "$($node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});const row=db.prepare("SELECT count(*) n FROM delivery WHERE submission=? AND recipient=? AND purpose=? AND state=?").get(process.argv[2],process.argv[3],"live","acknowledged");console.log(row.n);db.close();' "$state/guide.sqlite" "$submission" "$recipient")" = 1
event_id=$($node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});const row=db.prepare("SELECT wrapped FROM delivery WHERE submission=? AND recipient=?").get(process.argv[2],process.argv[3]);const event=JSON.parse(row.wrapped);if(!/^[0-9a-f]{64}$/.test(event.id))process.exit(1);console.log(event.id);db.close();' "$state/guide.sqlite" "$submission" "$recipient")

systemctl stop bitcoinwalk-guide.service
backup=$(mktemp -d /var/backups/bitcoinwalk-guide-exact-retry.XXXXXX);chmod 0700 "$backup"
cp -p "$target" "$backup/guide.cjs.before"
cp -p "$config" "$backup/config.json"
cp -aL "$state" "$backup/guide-state"
(
 cd "$backup";sha256sum guide.cjs.before config.json >SHA256SUMS
 find guide-state -type f -exec sha256sum '{}' + >>SHA256SUMS
)
echo "Consistent pre-retry Guide backup created: $backup"
changed=0
completed=0
rollback(){
 code=$?;trap - EXIT
 if [ "$changed" -eq 1 ]&&[ "$completed" -ne 1 ];then
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
 fi
 systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1||true
 systemctl start bitcoinwalk-guide.service >/dev/null 2>&1||true
 if [ "$completed" -ne 1 ];then echo "Exact Guide retry did not complete; accepted 0.3.66 bundle restored. Backup: $backup" >&2;fi
 exit "$code"
}
trap rollback EXIT

changed=1
install -o root -g root -m 0644 "$artifact" "$target"
retry_output=$(GUIDE_CONFIG="$config" CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" "$node" "$target" --retry-delivery "$submission" "$recipient")
printf '%s\n' "$retry_output"
printf '%s\n' "$retry_output"|grep -Fq '"reusedExactEvent":true'
printf '%s\n' "$retry_output"|grep -Fq "\"eventId\":\"$event_id\""
test "$($node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});const row=db.prepare("SELECT count(*) n FROM delivery WHERE submission=? AND recipient=? AND purpose=? AND state=?").get(process.argv[2],process.argv[3],"live","acknowledged");console.log(row.n);db.close();' "$state/guide.sqlite" "$submission" "$recipient")" = 1

systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service
systemctl is-active --quiet bitcoinwalk-guide.service
for unit in bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done

completed=1
trap - EXIT
echo "Exact Guide live-notification retry accepted on 0.3.67. Backup: $backup"
echo "The same signed gift-wrap event was re-published; no new message or delivery row was created."
