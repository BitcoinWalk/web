#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="0.1.0"
name="bitcoinwalk-hub-live-backup-receiver-$version"
target="$root/release-build/$name"
archive="$root/release-build/$name.tar.gz"

rm -rf -- "$target" "$archive" "$archive.sha256"
mkdir -p -- "$target"
cp \
  "$root/integrations/alby-fee-cap/backup/receive-encrypted-backup.sh" \
  "$root/integrations/alby-fee-cap/backup/prune-encrypted-backups.py" \
  "$root/integrations/alby-fee-cap/backup/check-backup-package.sh" \
  "$root/integrations/alby-fee-cap/backup/install-live-backup-receiver-update.sh" \
  "$target/"
chmod 755 "$target/"*.sh "$target/"*.py
(
  cd -- "$target"
  ./check-backup-package.sh
  sha256sum \
    receive-encrypted-backup.sh \
    prune-encrypted-backups.py \
    check-backup-package.sh \
    install-live-backup-receiver-update.sh > SHA256SUMS
)
tar -C "$root/release-build" -czf "$archive" "$name"
(cd -- "$root/release-build" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
printf '%s\n' "$archive"

