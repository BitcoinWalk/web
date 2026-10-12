#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk, not root." >&2; exit 1; }
test "$#" -eq 0 || { echo "Usage: $0" >&2; exit 1; }
cd "$(dirname "$0")"
sha256sum -c GRAZ-PRODUCTION-ENTITLEMENT-0.3.272-SHA256SUMS

runtime=/opt/bitcoinwalk-app-staging/runtime/bin/node
importer="$PWD/import-graz-production-entitlement.cjs"
source=/var/lib/bitcoinwalk-app-staging/payments.sqlite
target=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
unit=bitcoinwalk-app-production.service
health=http://127.0.0.1:3345/api/healthz
backup=$(mktemp -d /home/bitcoinwalk/backups/graz-production-entitlement.XXXXXX)

for file in "$runtime" "$importer" "$source" "$target";do test -f "$file" && test ! -L "$file";done
systemctl --user is-active --quiet "$unit"
curl -fsS --max-time 10 "$health" >"$backup/health.before.json"
grep -q '"status":"ok"' "$backup/health.before.json"
curl -fsS --max-time 15 https://bitcoinwalk.org/graz >"$backup/graz.before.html"
grep -q 'BitcoinWalk Graz' "$backup/graz.before.html"
"$runtime" "$importer" --verify-only | tee "$backup/verify.before.txt"
grep -q 'GRAZ_ENTITLEMENT_VERIFY_OK already_present=false' "$backup/verify.before.txt"
/home/bitcoinwalk/bin/backup-sqlite-online.mjs "$target" "$backup/payments.before.sqlite"

completed=false
recover(){ status=$?;trap - EXIT HUP INT TERM
  if ! "$completed";then
    systemctl --user stop "$unit" >/dev/null 2>&1 || true
    rm -f "$target-wal" "$target-shm"
    cp -p "$backup/payments.before.sqlite" "$target"
    systemctl --user start "$unit" >/dev/null 2>&1 || true
    echo "Graz entitlement import failed; production payments restored. Evidence: $backup" >&2
  fi
  exit "$status"
}
trap recover EXIT HUP INT TERM

systemctl --user stop "$unit"
"$runtime" "$importer" --apply | tee "$backup/import.txt"
grep -q 'GRAZ_ENTITLEMENT_IMPORT_OK created=true' "$backup/import.txt"
"$runtime" "$importer" --verify-only | tee "$backup/verify.after.txt"
grep -q 'GRAZ_ENTITLEMENT_VERIFY_OK already_present=true' "$backup/verify.after.txt"
systemctl --user start "$unit"
ready=false
for attempt in $(seq 1 40);do
  if curl -fsS --max-time 3 "$health" >"$backup/health.after.json" 2>/dev/null && grep -q '"status":"ok"' "$backup/health.after.json";then ready=true;break;fi
  sleep 1
done
test "$ready" = true
curl -fsS --max-time 15 https://bitcoinwalk.org/graz >"$backup/graz.after.html"
grep -q 'BitcoinWalk Graz' "$backup/graz.after.html"
(cd "$backup" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)
completed=true
trap - EXIT HUP INT TERM
echo "Graz production entitlement imported without a second payment. Organizer setup remains required. Evidence: $backup"
