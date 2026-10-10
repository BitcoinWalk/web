#!/bin/sh
set -eu

cd "$(dirname "$0")"
artifact=bitcoinwalk-guide-friendly-payout-0.3.250.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
unit=/etc/systemd/system/bitcoinwalk-guide.service
node=/opt/bitcoinwalk-app-staging/runtime/bin/node

test "$(id -u)" -eq 0
test "$(sha256sum "$artifact" | cut -d' ' -f1)" = 8bb1f5440e317c4bde41e0dd2f21237b064e248fd2c07ff95e8670ce668884d4
test "$(sha256sum "$target" | cut -d' ' -f1)" = 296c66bc9fa49f2487a6e178fb895ddafb48d470abc878cb0a6a899cadd63a00
test "$(sha256sum "$config" | cut -d' ' -f1)" = 3c02c4a926384f840464a6e1881b22ac0785f037d683519140bedb95c66f403f
test "$(sha256sum "$unit" | cut -d' ' -f1)" = 4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.249"}'

# Candidate performs read-only checks before the accepted worker is stopped.
GUIDE_CONFIG="$config" "$node" "$artifact" --dry-run
CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" GUIDE_CONFIG="$config" \
  "$node" "$artifact" --check-pro-setup

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-friendly-payout-0.3.250.XXXXXX)
chmod 0700 "$backup"
cp -p "$target" "$backup/guide.cjs.before"

rollback() {
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1 || true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1 || true
  echo "Guide friendly-message upgrade failed; previous worker restored. Backup: $backup" >&2
  exit 1
}
trap rollback INT TERM HUP EXIT

systemctl stop bitcoinwalk-guide.service
install -o root -g root -m 0644 "$artifact" "$target"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service

ready=false
for attempt in $(seq 1 30); do
  if systemctl is-active --quiet bitcoinwalk-guide.service; then
    sleep 3
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
test "$(sha256sum "$target" | cut -d' ' -f1)" = 8bb1f5440e317c4bde41e0dd2f21237b064e248fd2c07ff95e8670ce668884d4

trap - INT TERM HUP EXIT
echo "Guide friendly payout message 0.3.250 accepted. Backup: $backup"
echo "Existing delivery state was preserved; only future active-payout messages use the friendlier copy."
