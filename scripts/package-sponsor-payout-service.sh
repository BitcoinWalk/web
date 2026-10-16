#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.0;target="$root/release-build/bitcoinwalk-sponsor-payout-service-$version"
rm -rf "$target";mkdir -p "$target"
npx esbuild "$root/scripts/run-sponsor-payout-service.ts" --bundle --platform=node --target=node24 --format=cjs --outfile="$target/sponsor-payout-service.cjs" >/dev/null
npx esbuild "$root/scripts/verify-sponsor-payout-service.ts" --bundle --platform=node --target=node24 --format=cjs --outfile="$target/verify-sponsor-payout-service.cjs" >/dev/null
npx esbuild "$root/scripts/verify-sponsor-payout-restore.ts" --bundle --platform=node --target=node24 --format=cjs --outfile="$target/verify-sponsor-payout-restore.cjs" >/dev/null
cp "$root/deploy/backup-sqlite-online.mjs" "$target/";cp "$root/integrations/sponsor-payout-service/"* "$target/"
chmod 755 "$target/install-disabled.sh" "$target/backup-state.sh" "$target/monitor-disabled.sh" "$target/check-package.sh"
(cd "$target"&&sha256sum Dockerfile install-disabled.sh backup-state.sh monitor-disabled.sh check-package.sh bitcoinwalk-sponsor-payout-backup.service bitcoinwalk-sponsor-payout-backup.timer bitcoinwalk-sponsor-payout-monitor.service bitcoinwalk-sponsor-payout-monitor.timer backup-sqlite-online.mjs sponsor-payout-service.cjs verify-sponsor-payout-service.cjs verify-sponsor-payout-restore.cjs > SHA256SUMS&&./check-package.sh)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-sponsor-payout-service-$version"|gzip -n > "$root/release-build/bitcoinwalk-sponsor-payout-service-$version.tar.gz"
printf '%s\n' "$target"
