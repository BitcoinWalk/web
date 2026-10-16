#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="0.1.0"
name="bitcoinwalk-live-hub-boundary-audit-$version"
target="$root/release-build/$name"
archive="$root/release-build/$name.tar.gz"

rm -rf -- "$target" "$archive" "$archive.sha256"
mkdir -p -- "$target"
cp \
  "$root/integrations/alby-fee-cap/inspect-live-hub-boundary.sh" \
  "$root/integrations/alby-fee-cap/check-live-hub-boundary-package.sh" \
  "$target/"
chmod 755 "$target/"*.sh

(
  cd -- "$target"
  ./check-live-hub-boundary-package.sh
  sha256sum inspect-live-hub-boundary.sh check-live-hub-boundary-package.sh > SHA256SUMS
)

tar -C "$root/release-build" -czf "$archive" "$name"
(cd -- "$root/release-build" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
printf '%s\n' "$archive"
