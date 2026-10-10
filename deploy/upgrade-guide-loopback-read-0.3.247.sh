#!/bin/sh
set -eu

cd "$(dirname "$0")"
artifact=bitcoinwalk-guide-loopback-read-0.3.247.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
unit=/etc/systemd/system/bitcoinwalk-guide.service
node=/opt/bitcoinwalk-app-staging/runtime/bin/node

test "$(id -u)" -eq 0
test "$(sha256sum "$artifact" | cut -d' ' -f1)" = 296c66bc9fa49f2487a6e178fb895ddafb48d470abc878cb0a6a899cadd63a00
test "$(sha256sum "$target" | cut -d' ' -f1)" = 20f6fc757f3a768fb92e53966173db4d85fe6717d8f7111ffa799186ac5d210e
test "$(sha256sum "$config" | cut -d' ' -f1)" = b9f9c509006d6ef85359e3e3c8d7cd134a1efdf39e008ac69ee428a0b08582bf
test "$(sha256sum "$unit" | cut -d' ' -f1)" = 4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.246"}'

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-loopback-read-0.3.247.XXXXXX)
chmod 0700 "$backup"
python3 - "$config" "$backup/config.candidate.json" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as stream:
    config=json.load(stream)
if "sourceReadRelay" in config:
    raise SystemExit("sourceReadRelay already exists; stop for review")
config["sourceReadRelay"]="ws://127.0.0.1:3334/"
with open(sys.argv[2],"w",encoding="utf-8") as stream:
    json.dump(config,stream,indent=2)
    stream.write("\n")
PY

# Prove the exact candidate can read complete relay history over loopback and
# can still authorize the Guide-only Pro status projection before activation.
GUIDE_CONFIG="$backup/config.candidate.json" "$node" "$artifact" --dry-run
CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" GUIDE_CONFIG="$backup/config.candidate.json" \
  "$node" "$artifact" --check-pro-setup

systemctl stop bitcoinwalk-guide.service
cp -p "$target" "$backup/guide.cjs.before"
cp -p "$config" "$backup/config.before.json"
cp -aL "$state" "$backup/guide-state"

rollback() {
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
  install -o root -g root -m 0644 "$backup/config.before.json" "$config"
  test "$state" = /var/lib/bitcoinwalk-guide
  rm -rf "$state"
  cp -a "$backup/guide-state" "$state"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1 || true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1 || true
  echo "Guide loopback-read upgrade failed; accepted worker, config and queue restored. Backup: $backup" >&2
  exit 1
}
trap rollback INT TERM HUP EXIT

install -o root -g root -m 0644 "$artifact" "$target"
install -o root -g root -m 0644 "$backup/config.candidate.json" "$config"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service

ready=false
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet bitcoinwalk-guide.service && test -f "$state/guide.sqlite"; then
    sleep 3
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
test "$(sha256sum "$target" | cut -d' ' -f1)" = 296c66bc9fa49f2487a6e178fb895ddafb48d470abc878cb0a6a899cadd63a00

trap - INT TERM HUP EXIT
echo "Guide loopback relay reads 0.3.247 accepted. Backup: $backup"
echo "Public relay links remain unchanged; local Guide history reads use ws://127.0.0.1:3334/."
