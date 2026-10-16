#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="0.1.1"
name="bitcoinwalk-live-hub-feecap-cutover-$version"
target="$root/release-build/$name"
archive="$root/release-build/$name.tar.gz"

rm -rf -- "$target" "$archive" "$archive.sha256"
mkdir -p -- "$target"
cp \
  "$root/integrations/alby-fee-cap/Dockerfile.production" \
  "$root/integrations/alby-fee-cap/production-entrypoint.sh" \
  "$root/integrations/alby-fee-cap/cutover-live-hub-feecap.sh" \
  "$root/integrations/alby-fee-cap/rollback-live-hub-feecap.sh" \
  "$root/integrations/alby-fee-cap/finalize-live-hub-feecap.sh" \
  "$root/integrations/alby-fee-cap/check-live-hub-cutover-package.sh" \
  "$target/"
chmod 755 "$target/"*.sh
(
  cd -- "$target"
  ./check-live-hub-cutover-package.sh
  sha256sum Dockerfile.production production-entrypoint.sh cutover-live-hub-feecap.sh rollback-live-hub-feecap.sh finalize-live-hub-feecap.sh check-live-hub-cutover-package.sh > SHA256SUMS
)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "$name" | gzip -n > "$archive"
(cd -- "$root/release-build" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
printf '%s\n' "$archive"
