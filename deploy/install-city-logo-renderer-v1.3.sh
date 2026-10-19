#!/bin/bash
set -euo pipefail

version=city-logo-inkscape-v1.3
archive_name=bitcoinwalk-city-logo-renderer-city-logo-inkscape-v1.3.tar.gz
expected=02f0facd0945f97472184e089e9c42a83bc8d7b08ec8c3574613ab9d094ac6d0
bundle=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
archive="$bundle/$archive_name"
runtime=/opt/bitcoinwalk-app-staging/runtime/bin/node
library=/home/bitcoinwalk/.local/lib/bitcoinwalk-city-logo-renderer
target="$library/$version"
launcher=/home/bitcoinwalk/bin/render-city-logo-pack
backup_root=/home/bitcoinwalk/.local/state/bitcoinwalk/backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_root/city-logo-renderer-v1.3.$stamp"
databases=(
  /var/lib/bitcoinwalk-app-staging/payments.sqlite
  /home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
)

test "$(id -un)" = bitcoinwalk
test -x "$runtime"
test -f "$archive"
test -f "$bundle/retry-city-logo-jobs-v1.3.mjs"
actual=$(sha256sum "$archive" | awk '{print $1}')
test "$actual" = "$expected"
mkdir -p "$library" /home/bitcoinwalk/bin "$backup"

temporary=$(mktemp -d "$library/.install-v1.3.XXXXXX")
smoke=$(mktemp -d /home/bitcoinwalk/.local/state/bitcoinwalk/.renderer-v1.3-smoke.XXXXXX)
cleanup(){ rm -rf -- "$temporary" "$smoke"; }
trap cleanup EXIT

tar -xzf "$archive" -C "$temporary"
test -x "$temporary/$version/bin/render-city-logo-pack"
test "$(cat "$temporary/$version/VERSION")" = "$version"
"$temporary/$version/bin/render-city-logo-pack" \
  --city-id 6e3731a6-1f62-440f-9588-c087d82b0678 \
  --city-name Madeira --slug madeira --locale pt-PT --output "$smoke" >/dev/null
"$runtime" -e '
const fs=require("node:fs"),manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if(manifest.templateVersion!=="city-logo-inkscape-v1.3"||manifest.files.length!==12||manifest.files.filter(file=>file.name.includes("city-lockup")).length!==2)process.exit(1);
' "$smoke/madeira/manifest.json"

for database in "${databases[@]}"; do
  test -f "$database"
  safe_name=$(basename "$(dirname "$database")")
  "$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/$safe_name-payments.before.sqlite"
done
if test -L "$launcher"; then readlink -f "$launcher" >"$backup/renderer.before.txt"; fi

if test ! -e "$target"; then mv "$temporary/$version" "$target"; fi
test -x "$target/bin/render-city-logo-pack"
ln -s "$target/bin/render-city-logo-pack" "$launcher.next"
mv -Tf "$launcher.next" "$launcher"

for database in "${databases[@]}"; do
  "$runtime" "$bundle/retry-city-logo-jobs-v1.3.mjs" "$database"
done
systemctl --user restart bitcoinwalk-app-staging.service bitcoinwalk-app-production.service
systemctl --user is-active --quiet bitcoinwalk-app-staging.service
systemctl --user is-active --quiet bitcoinwalk-app-production.service

echo "City logo renderer v1.3 installed. Database backups: $backup"
