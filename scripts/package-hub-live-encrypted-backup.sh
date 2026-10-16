#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="0.1.1"
name="bitcoinwalk-hub-live-encrypted-backup-$version"
target="$root/release-build/$name"
archive="$root/release-build/$name.tar.gz"

rm -rf -- "$target" "$archive" "$archive.sha256"
mkdir -p -- "$target"
cp \
  "$root/integrations/alby-fee-cap/backup/backup-live-hub-state.sh" \
  "$root/integrations/alby-fee-cap/backup/verify-live-backup-restore.sh" \
  "$root/integrations/alby-fee-cap/backup/update-backup-host-pin.sh" \
  "$root/integrations/alby-fee-cap/backup/check-live-backup-package.sh" \
  "$target/"
chmod 755 "$target/"*.sh
(
  cd -- "$target"
  ./check-live-backup-package.sh
  sha256sum backup-live-hub-state.sh verify-live-backup-restore.sh update-backup-host-pin.sh check-live-backup-package.sh > SHA256SUMS
)
tar -C "$root/release-build" -czf "$archive" "$name"
(cd -- "$root/release-build" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
printf '%s\n' "$archive"
