#!/bin/sh
set -eu

cd "$(dirname "$0")"
artifact=bitcoinwalk-guide-welcome-lifecycle-0.3.403.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
unit=/etc/systemd/system/bitcoinwalk-guide.service
node=/opt/bitcoinwalk-app-staging/runtime/bin/node

test "$(id -u)" -eq 0
test "$(sha256sum "$artifact" | cut -d' ' -f1)" = 0606719d763b819eeb8356ae335b1eccc3d1e4b3a2eafab88808d3a72cd08591
test "$(sha256sum "$target" | cut -d' ' -f1)" = 8bb1f5440e317c4bde41e0dd2f21237b064e248fd2c07ff95e8670ce668884d4
test "$(sha256sum "$config" | cut -d' ' -f1)" = 3c02c4a926384f840464a6e1881b22ac0785f037d683519140bedb95c66f403f
test "$(sha256sum "$unit" | cut -d' ' -f1)" = 4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.402"}'

# Prove the candidate can read the current feeds before touching the accepted worker.
GUIDE_CONFIG="$config" "$node" "$artifact" --dry-run
CREDENTIALS_DIRECTORY=/etc/bitcoinwalk-guide STATE_DIRECTORY="$state" GUIDE_CONFIG="$config" \
  "$node" "$artifact" --check-pro-setup

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-welcome-lifecycle-0.3.403.XXXXXX)
chmod 0700 "$backup"

rollback() {
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
  test "$state" = /var/lib/bitcoinwalk-guide
  rm -rf "$state"
  cp -a "$backup/guide-state" "$state"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1 || true
  systemctl start bitcoinwalk-guide.service >/dev/null 2>&1 || true
  echo "Guide welcome-lifecycle upgrade failed; accepted worker and delivery state restored. Backup: $backup" >&2
  exit 1
}
trap rollback INT TERM HUP EXIT

systemctl stop bitcoinwalk-guide.service
cp -p "$target" "$backup/guide.cjs.before"
cp -aL "$state" "$backup/guide-state"
install -o root -g root -m 0644 "$artifact" "$target"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service

ready=false
for attempt in $(seq 1 45); do
  if systemctl is-active --quiet bitcoinwalk-guide.service && \
    STATE_DIRECTORY="$state" "$node" --input-type=commonjs -e '
      const {DatabaseSync}=require("node:sqlite");
      const db=new DatabaseSync(process.env.STATE_DIRECTORY+"/guide.sqlite",{readOnly:true});
      const row=db.prepare("SELECT value FROM meta WHERE key = ?").get("pro-welcome-initialized");
      db.close();
      if(row?.value!=="1")process.exit(1);
    ' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done
test "$ready" = true
test "$(sha256sum "$target" | cut -d' ' -f1)" = 0606719d763b819eeb8356ae335b1eccc3d1e4b3a2eafab88808d3a72cd08591
! journalctl -u bitcoinwalk-guide.service --since '-2 minutes' --no-pager | grep -Fq 'Guide scan failed'

trap - INT TERM HUP EXIT
echo "Guide welcome lifecycle 0.3.403 accepted. Backup: $backup"
echo "Existing Pro cities were baselined; no historical welcome was queued. The app can now publish the complete state."
