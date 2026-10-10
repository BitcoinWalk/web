#!/bin/sh
set -eu
cd "$(dirname "$0")"
artifact=bitcoinwalk-guide-pro-setup-0.3.220.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
test "$(id -u)" -eq 0
test "$(sha256sum "$artifact"|cut -d' ' -f1)" = b19a101045786feb2ba6693a8dcdf063548f05c3307201bf9c7ba7ba9c903a8a
test "$(sha256sum "$target"|cut -d' ' -f1)" = 09d8cd70fc21b19b62dba61dfa9b239661e95e36e5f51c718af7a9472524c924
test "$(sha256sum "$config"|cut -d' ' -f1)" = 150bd1c15425f1601434e1d837a945247399f178c8763074b1a3ebb38dc57125
test "$(sha256sum /etc/systemd/system/bitcoinwalk-guide.service|cut -d' ' -f1)" = 4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.220"}'
backup=$(mktemp -d /var/backups/bitcoinwalk-guide-pro-setup-0.3.220.XXXXXX);chmod 0700 "$backup"
python3 - "$config" "$backup/config.candidate.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as stream: config=json.load(stream)
config["proSetupStatusURL"]="http://127.0.0.1:3338/api/pro-setup-notifications"
config["proSetupAdminURL"]="https://app-staging.bitcoinwalk.org/admin/upgrade"
with open(sys.argv[2],"w",encoding="utf-8") as stream: json.dump(config,stream,indent=2);stream.write("\n")
PY
CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" GUIDE_CONFIG="$backup/config.candidate.json" "$node" "$artifact" --check-pro-setup
systemctl stop bitcoinwalk-guide.service
cp -p "$target" "$backup/guide.cjs.before";cp -p "$config" "$backup/config.before.json";cp -aL "$state" "$backup/guide-state"
rollback(){ install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target";install -o root -g root -m 0644 "$backup/config.before.json" "$config";test "$state" = /var/lib/bitcoinwalk-guide;rm -rf "$state";cp -a "$backup/guide-state" "$state";systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1||true;systemctl start bitcoinwalk-guide.service >/dev/null 2>&1||true;echo "Guide Pro setup upgrade failed; accepted worker and queue restored. Backup: $backup" >&2;exit 1;}
trap rollback INT TERM HUP EXIT
install -o root -g root -m 0644 "$artifact" "$target"
install -o root -g root -m 0644 "$backup/config.candidate.json" "$config"
systemctl reset-failed bitcoinwalk-guide.service;systemctl start bitcoinwalk-guide.service
ready=false
for attempt in $(seq 1 30);do if systemctl is-active --quiet bitcoinwalk-guide.service&&test -f "$state/guide.sqlite";then sleep 3;ready=true;break;fi;sleep 1;done
test "$ready" = true
test "$($node -e 'const{DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare("SELECT count(*) n FROM sqlite_master WHERE type=? AND name=?").get("table","pro_setup_state").n);d.close()' "$state/guide.sqlite")" = 1
trap - INT TERM HUP EXIT
echo "Guide Pro setup notifications 0.3.220 accepted. Backup: $backup"
echo "New incomplete paid-city tasks notify their freshly verified owner once; exact encrypted retries remain durable."
