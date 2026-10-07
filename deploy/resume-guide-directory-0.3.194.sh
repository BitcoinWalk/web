#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
manifest=GUIDE-DIRECTORY-BASELINE-0.3.194-SHA256SUMS
artifact=bitcoinwalk-guide-directory-0.3.194.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
test "$(id -u)" -eq 0
sha256sum -c "$manifest"
test "$(sha256sum "$target"|cut -d' ' -f1)" = c32711c5d26b5f583fb2b9ad7e80386f54e36e07e05f4783b43eb1a16e7a5a3c
test "$(sha256sum "$config"|cut -d' ' -f1)" = d70ac371a41238a24dcd603a57a72b83bd90bb4e990905293e0f1cc05e749455
test "$(curl -fsS http://127.0.0.1:3345/api/healthz|python3 -c 'import json,sys;print(json.load(sys.stdin)["release"])')" = app-production-0.3.191
backup=$(mktemp -d /var/backups/bitcoinwalk-guide-directory-resume.XXXXXX);chmod 0700 "$backup"
systemctl stop bitcoinwalk-guide.service
cp -p "$target" "$backup/guide.cjs.before";cp -p "$config" "$backup/config.before.json";cp -aL "$state" "$backup/guide-state"
rollback(){ install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target";install -o root -g root -m 0644 "$backup/config.before.json" "$config";rm -rf "$state";cp -a "$backup/guide-state" "$state";systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1||true;systemctl start bitcoinwalk-guide.service >/dev/null 2>&1||true;echo "Guide directory resume failed; accepted worker restored. Backup: $backup" >&2;exit 1; }
trap rollback INT TERM HUP EXIT
python3 - "$config" "$backup/config.candidate.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as stream: config=json.load(stream)
config["directoryStatusURL"]="http://127.0.0.1:3345/api/directory-notifications"
config["directoryAdminURL"]="https://bitcoinwalk.org/admin"
with open(sys.argv[2],"w",encoding="utf-8") as stream: json.dump(config,stream,indent=2);stream.write("\n")
PY
install -o root -g root -m 0644 "$artifact" "$target";install -o root -g root -m 0644 "$backup/config.candidate.json" "$config"
GUIDE_CONFIG="$config" CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" "$node" "$target" --baseline-directory
test "$($node -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare("SELECT count(*) n FROM directory_state WHERE request_id=? AND state=?").get("b5c70f37-c558-42d6-85fa-f8881b2d6b73","signed:active").n);d.close()' "$state/guide.sqlite")" = 1
test "$($node -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare("SELECT count(*) n FROM delivery WHERE purpose LIKE ?").get("directory-%").n);d.close()' "$state/guide.sqlite")" = 0
systemctl reset-failed bitcoinwalk-guide.service;systemctl start bitcoinwalk-guide.service;systemctl is-active --quiet bitcoinwalk-guide.service
trap - INT TERM HUP EXIT
echo "Guide directory notifications accepted on 0.3.194. Backup: $backup"
echo "Existing London state was silently baselined; future invitation, active and failed transitions use the durable encrypted outbox."
