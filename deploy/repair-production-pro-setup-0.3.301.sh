#!/bin/bash
set -euo pipefail
umask 077

test "$(id -u)" -eq 0 || { echo "Run with sudo." >&2; exit 1; }
test "$#" -eq 1 || { echo "Usage: $0 /path/to/app-production-0.3.301.tar.gz" >&2; exit 1; }

archive=$(readlink -f "$1")
test "$(basename "$archive")" = app-production-0.3.301.tar.gz
test -f "$archive" && test -f "$archive.sha256"
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive.sha256")")

hash=7d03cb20c151f7db6eca2d8db49c2bea00f0dd5f50560f4610f84c0563b10e1f
source_file=/var/lib/bitcoinwalk-app-media/files/$hash.webp
target_dir=/home/bitcoinwalk/.local/share/bitcoinwalk-production/media/files
target_file=$target_dir/$hash.webp
deploy=/home/bitcoinwalk/bin/deploy-production-app
bitcoinwalk_uid=$(id -u bitcoinwalk)
bitcoinwalk_gid=$(id -g bitcoinwalk)
evidence=$(mktemp -d /var/backups/bitcoinwalk-production-pro-setup-0.3.301.XXXXXX)

test -f "$source_file" && test ! -L "$source_file"
test "$(sha256sum "$source_file" | cut -d' ' -f1)" = "$hash"
test -x "$deploy"
install -d -o bitcoinwalk -g bitcoinwalk -m 0700 "$target_dir"
if test -e "$target_file"; then
  test -f "$target_file" && test ! -L "$target_file"
  test "$(sha256sum "$target_file" | cut -d' ' -f1)" = "$hash"
else
  install -o bitcoinwalk -g bitcoinwalk -m 0600 "$source_file" "$target_file.next"
  test "$(sha256sum "$target_file.next" | cut -d' ' -f1)" = "$hash"
  mv "$target_file.next" "$target_file"
fi
sha256sum "$source_file" "$target_file" >"$evidence/graz-media.sha256"

runuser -u bitcoinwalk -- env XDG_RUNTIME_DIR="/run/user/$bitcoinwalk_uid" "$deploy" "$archive" | tee "$evidence/deploy.txt"
curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz >"$evidence/health.json"
grep -Fq '"release":"app-production-0.3.301"' "$evidence/health.json"
curl -fsS --max-time 15 "https://bitcoinwalk.org/api/media/files/$hash.webp" -o "$evidence/graz.webp"
test "$(sha256sum "$evidence/graz.webp" | cut -d' ' -f1)" = "$hash"
rm "$evidence/graz.webp"
test "$(systemctl --user --machine=bitcoinwalk@ show bitcoinwalk-app-production.service -p ActiveState --value)" = active

echo "Production Pro setup repair 0.3.301 accepted. Graz artwork is present by exact hash; no signed city, payment, identity or payout record was changed. Evidence: $evidence"
