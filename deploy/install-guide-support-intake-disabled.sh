#!/bin/sh
set -eu

test "$(id -u)" -eq 0 || { echo "Run as root." >&2; exit 1; }
release_dir=${1:-}
test -n "$release_dir" && test -d "$release_dir" || { echo "Usage: $0 RELEASE_DIRECTORY" >&2; exit 1; }

bundle="$release_dir/guide.cjs"
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
unit=bitcoinwalk-guide.service
expected_old=049989c40279474f7f21a6c3bb26337f7b090fb232f44c8abf2b35c55faca350
expected_new=540e5c4c9df19e8ba3fd93a019a0be4ba1dcd07f887f35df472e4aecfeb9a40b

test -f "$bundle" && test ! -L "$bundle" || { echo "Guide bundle is missing or unsafe." >&2; exit 1; }
test -f "$target" && test ! -L "$target" || { echo "Installed Guide bundle is missing or unsafe." >&2; exit 1; }
test -f "$config" && test ! -L "$config" || { echo "Guide configuration is missing or unsafe." >&2; exit 1; }
echo "$expected_new  $bundle" | sha256sum -c -
test "$(sha256sum "$target" | awk '{print $1}')" = "$expected_old" || { echo "Installed Guide bundle changed; refusing replacement." >&2; exit 1; }
systemctl is-active --quiet "$unit" || { echo "Guide service is not active." >&2; exit 1; }
/opt/bitcoinwalk-app-staging/runtime/bin/node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(Object.hasOwn(p,"support"))process.exit(1);' "$config" || { echo "Guide support configuration already exists; review manually." >&2; exit 1; }

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-bw67-disabled.XXXXXX)
cp -a "$target" "$backup/guide.cjs"
cp -a "$config" "$backup/config.json"
rollback(){
  install -o root -g root -m 0755 "$backup/guide.cjs" "$target"
  systemctl restart "$unit" || true
}
trap rollback HUP INT TERM

install -o root -g root -m 0755 "$bundle" "$target"
test "$(sha256sum "$target" | awk '{print $1}')" = "$expected_new"
if ! systemctl restart "$unit" || ! systemctl is-active --quiet "$unit"; then
  rollback
  echo "Guide update failed and the previous worker was restored." >&2
  exit 1
fi
sleep 2
systemctl is-active --quiet "$unit" || { rollback; echo "Guide stopped after restart; previous worker restored." >&2; exit 1; }
trap - HUP INT TERM

echo "BW-67 Guide worker installed and verified with support DISABLED."
echo "No inbox was published and no support configuration was enabled."
echo "Backup: $backup"
sha256sum "$target"
systemctl status "$unit" --no-pager -n 8
