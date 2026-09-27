#!/bin/sh
# Add only the two already-reviewed discovery relays needed by an organizer's
# verified NIP-17 inbox list. Preserve the encrypted outbox and exact retry ID.
set -eu

test "$(id -u)" -eq 0||{ echo 'Run with sudo.' >&2;exit 1; }
cd "$(dirname "$0")/.."
manifest=GUIDE-INBOX-ALLOWLIST-0.3.64-SHA256SUMS
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
accepted_config=6cb189106f6a51f07de6578d289c9b42ff655060c7ec00a76b1e5cfb691a23e0

sha256sum -c "$manifest"
test "$(sha256sum "$config"|cut -d ' ' -f 1)" = "$accepted_config"
for unit in bitcoinwalk-guide bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done
backup=$(mktemp -d /var/backups/bitcoinwalk-guide-inbox-allowlist.XXXXXX);chmod 0700 "$backup"
systemctl stop bitcoinwalk-guide.service
cp -p "$config" "$backup/config.before.json"
cp -aL "$state" "$backup/guide-state"
(
 cd "$backup";sha256sum config.before.json >SHA256SUMS
 find guide-state -type f -exec sha256sum '{}' + >>SHA256SUMS
)
echo "Consistent pre-change Guide backup created: $backup"
changed=0
completed=0
rollback(){
 code=$?;trap - EXIT
 if [ "$code" -ne 0 ]&&[ "$changed" -eq 1 ];then
  install -o root -g root -m 0644 "$backup/config.before.json" "$config"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1||true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1||true
  echo "Guide inbox allowlist activation failed; prior configuration restored. Durable state was not overwritten. Backup: $backup" >&2
 fi
 if [ "$completed" -ne 1 ];then echo 'Guide inbox allowlist activation did not complete.' >&2;fi
 exit "$code"
}
trap rollback EXIT

/opt/bitcoinwalk-app-staging/runtime/bin/node -e '
const fs=require("node:fs"),source=process.argv[1],target=process.argv[2];
const config=JSON.parse(fs.readFileSync(source,"utf8"));
const additions=["wss://relay.damus.io/","wss://nos.lol/"];
if(!Array.isArray(config.allowedInboxRelays))throw new Error("Missing inbox allowlist.");
config.allowedInboxRelays=[...new Set([...config.allowedInboxRelays,...additions])];
if(config.allowedInboxRelays.length>10||!additions.every(value=>config.allowedInboxRelays.includes(value)))throw new Error("Invalid resulting allowlist.");
fs.writeFileSync(target,JSON.stringify(config,null,2)+"\n",{mode:0o600});
' "$config" "$backup/config.candidate.json"
changed=1
install -o root -g root -m 0644 "$backup/config.candidate.json" "$config"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service
sleep 12
systemctl is-active --quiet bitcoinwalk-guide.service
echo 'Queue summary after allowlist retry:'
/opt/bitcoinwalk-app-staging/runtime/bin/node -e 'const{DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(JSON.stringify(db.prepare("SELECT purpose,state,count(*) AS count FROM delivery GROUP BY purpose,state ORDER BY purpose,state").all()));db.close();' "$state/guide.sqlite"
for unit in bitcoinwalk-app-staging bitcoinwalk-relay bitcoinwalk-replica-rehearsal bitcoinwalk-replica-firstwalk caddy;do systemctl is-active --quiet "$unit";done

completed=1
trap - EXIT
echo "Guide inbox allowlist accepted for the two existing discovery relays. Backup: $backup"
echo 'No message content, recipient, event, app, relay database, DNS or Caddy configuration was changed.'
