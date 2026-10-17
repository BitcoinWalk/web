#!/bin/sh
set -eu

cd "$(dirname "$0")"
artifact=bitcoinwalk-guide-hosts-0.3.418.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
unit=/etc/systemd/system/bitcoinwalk-guide.service
node=/opt/bitcoinwalk-app-staging/runtime/bin/node

test "$(id -u)" -eq 0
test "$(sha256sum "$artifact" | cut -d' ' -f1)" = a8ee6c72a76c69dbf1841446d6b8400c184fd515dbe6944f9f378d280cc5c7bd
test "$(sha256sum "$target" | cut -d' ' -f1)" = c58dfaea95c441972bd03d3406ccd5d81c1f1ea0e146e68355aa232f22567920
test "$(sha256sum "$config" | cut -d' ' -f1)" = 3c02c4a926384f840464a6e1881b22ac0785f037d683519140bedb95c66f403f
test "$(sha256sum "$unit" | cut -d' ' -f1)" = 4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.420"}'

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-hosts-0.3.418.XXXXXX)
chmod 0700 "$backup"
python3 - "$config" "$backup/config.candidate.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as stream: config=json.load(stream)
config["organizerChatStatusURL"]="http://127.0.0.1:3338/api/organizer-chat-invitations"
config["organizerChatURL"]="https://bitcoinwalk.org/chat/hosts"
with open(sys.argv[2],"w",encoding="utf-8") as stream: json.dump(config,stream,indent=2);stream.write("\n")
PY

# Validate the exact Guide identity against the current-owner projection before
# the accepted worker or its durable queue is touched.
CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" GUIDE_CONFIG="$backup/config.candidate.json" \
  "$node" "$artifact" --check-organizer-chat

systemctl stop bitcoinwalk-guide.service
cp -p "$target" "$backup/guide.cjs.before"
cp -p "$config" "$backup/config.before.json"
cp -aL "$state" "$backup/guide-state"

rollback(){
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
  install -o root -g root -m 0644 "$backup/config.before.json" "$config"
  test "$state" = /var/lib/bitcoinwalk-guide
  rm -rf "$state"
  cp -a "$backup/guide-state" "$state"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1 || true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1 || true
  echo "Guide Hosts invitation upgrade failed; accepted worker and queue restored. Backup: $backup" >&2
  exit 1
}
trap rollback INT TERM HUP EXIT

install -o root -g root -m 0644 "$artifact" "$target"
install -o root -g root -m 0644 "$backup/config.candidate.json" "$config"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service

ready=false
for attempt in $(seq 1 30);do
  if systemctl is-active --quiet bitcoinwalk-guide.service&&test -f "$state/guide.sqlite";then sleep 3;ready=true;break;fi
  sleep 1
done
test "$ready" = true
test "$(sha256sum "$target" | cut -d' ' -f1)" = a8ee6c72a76c69dbf1841446d6b8400c184fd515dbe6944f9f378d280cc5c7bd

trap - INT TERM HUP EXIT
echo "Guide Hosts invitations 0.3.418 accepted. Backup: $backup"
echo "Current owners are queued once from the authoritative city-owner projection; exact encrypted retries remain durable."
