#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

manifest=GUIDE-STATE-DIRECTORY-REPAIR-0.3.195-SHA256SUMS
unit=bitcoinwalk-guide.service
public_state=/var/lib/bitcoinwalk-guide
private_state=/var/lib/private/bitcoinwalk-guide
node=/opt/bitcoinwalk-app-staging/runtime/bin/node

test "$(id -u)" -eq 0
sha256sum -c "$manifest"

systemctl cat "$unit" | grep -qx 'DynamicUser=yes'
systemctl cat "$unit" | grep -qx 'StateDirectory=bitcoinwalk-guide'
test -d "$public_state"
test ! -L "$public_state"
test -d "$private_state"
test -f "$public_state/guide.sqlite"

test "$(
  "$node" -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    const row = db.prepare("SELECT count(*) AS n FROM directory_state WHERE request_id = ? AND state = ?")
      .get("b5c70f37-c558-42d6-85fa-f8881b2d6b73", "signed:active");
    console.log(row.n);
    db.close();
  ' "$public_state/guide.sqlite"
)" = 1

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-state-directory.XXXXXX)
chmod 0700 "$backup"
systemctl stop "$unit"
cp -a "$public_state" "$backup/public-state.before"
cp -a "$private_state" "$backup/private-state.before"

repair_failed() {
  echo "Guide state-directory repair did not complete. Both original state copies remain in: $backup" >&2
  exit 1
}
trap repair_failed INT TERM HUP EXIT

rm -rf "$private_state"
mv "$public_state" "$private_state"
ln -s private/bitcoinwalk-guide "$public_state"

test -L "$public_state"
test "$(readlink "$public_state")" = private/bitcoinwalk-guide
test -f "$private_state/guide.sqlite"

systemctl reset-failed "$unit"
systemctl start "$unit"

attempt=0
while :; do
  active=$(systemctl show "$unit" --property=ActiveState --value)
  sub=$(systemctl show "$unit" --property=SubState --value)
  if test "$active" = active && test "$sub" = running; then
    break
  fi
  attempt=$((attempt + 1))
  if test "$attempt" -ge 30; then
    systemctl status "$unit" --no-pager --full >&2 || true
    exit 1
  fi
  sleep 1
done

sleep 3
test "$(systemctl show "$unit" --property=ActiveState --value)" = active
test "$(systemctl show "$unit" --property=SubState --value)" = running
test "$(systemctl show "$unit" --property=ExecMainStatus --value)" = 0

test "$(
  "$node" -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    const row = db.prepare("SELECT count(*) AS n FROM directory_state WHERE request_id = ? AND state = ?")
      .get("b5c70f37-c558-42d6-85fa-f8881b2d6b73", "signed:active");
    console.log(row.n);
    db.close();
  ' "$private_state/guide.sqlite"
)" = 1

trap - INT TERM HUP EXIT
echo "Guide protected state-directory repair accepted on 0.3.195. Backup: $backup"
echo "The London baseline was preserved and the Guide is active with the systemd DynamicUser layout restored."
