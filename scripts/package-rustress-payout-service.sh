#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version=0.2.5
target="$root/release-build/bitcoinwalk-rustress-payout-service-$version"
rm -rf "$target"
mkdir -p "$target"
cp "$root/release-build/rustress-payout-service.cjs" "$target/"
cp "$root/release-build/verify-rustress-payout-service.cjs" "$target/"
cp "$root/release-build/verify-rustress-payout-active.cjs" "$target/"
cp "$root/release-build/initialize-rustress-payout-ledger.cjs" "$target/"
cp "$root/deploy/backup-sqlite-online.mjs" "$target/"
cp "$root/integrations/rustress/payout-service/Dockerfile" "$target/"
cp "$root/integrations/rustress/payout-service/install-payout-service.sh" "$target/install.sh"
cp "$root/integrations/rustress/payout-service/arm-payout-service.sh" "$target/arm.sh"
cp "$root/integrations/rustress/payout-service/disarm-payout-service.sh" "$target/disarm.sh"
cp "$root/integrations/rustress/payout-service/rehearse-disabled-rollback.sh" "$target/rehearse-disabled-rollback.sh"
cp "$root/integrations/rustress/payout-service/check-package.sh" "$target/check-package.sh"
cp "$root/integrations/rustress/payout-backup/monitor-payout-state.sh" "$target/monitor-payout-state.sh"
cp "$root/scripts/rotate-rustress-payout-api-credential.py" "$target/rotate-api-credential.py"
chmod 755 "$target/install.sh" "$target/arm.sh" "$target/disarm.sh" "$target/rehearse-disabled-rollback.sh" "$target/check-package.sh" "$target/monitor-payout-state.sh" "$target/rotate-api-credential.py"
(cd "$target" && sha256sum Dockerfile install.sh arm.sh disarm.sh rehearse-disabled-rollback.sh check-package.sh monitor-payout-state.sh rotate-api-credential.py backup-sqlite-online.mjs initialize-rustress-payout-ledger.cjs rustress-payout-service.cjs verify-rustress-payout-service.cjs verify-rustress-payout-active.cjs > SHA256SUMS && ./check-package.sh)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-payout-service-$version"|gzip -n >"$root/release-build/bitcoinwalk-rustress-payout-service-$version.tar.gz"
printf '%s\n' "$target"
