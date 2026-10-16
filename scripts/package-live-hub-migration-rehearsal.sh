#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="0.1.2"
name="bitcoinwalk-live-hub-migration-rehearsal-$version"
target="$root/release-build/$name"
archive="$root/release-build/$name.tar.gz"

rm -rf -- "$target" "$archive" "$archive.sha256"
mkdir -p -- "$target"
cp \
  "$root/integrations/alby-fee-cap/rehearse-live-hub-migration.sh" \
  "$root/integrations/alby-fee-cap/check-live-hub-migration-rehearsal.sh" \
  "$target/"
chmod 755 "$target/"*.sh
(
  cd -- "$target"
  ./check-live-hub-migration-rehearsal.sh
  sha256sum rehearse-live-hub-migration.sh check-live-hub-migration-rehearsal.sh > SHA256SUMS
)
tar -C "$root/release-build" -czf "$archive" "$name"
(cd -- "$root/release-build" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
printf '%s\n' "$archive"
