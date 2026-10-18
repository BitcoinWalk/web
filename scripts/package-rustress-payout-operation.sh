#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.2.16;target="$root/release-build/bitcoinwalk-rustress-payout-operation-$version";source="$root/integrations/rustress/payout-operation"
rm -rf "$target";mkdir -p "$target"
cp "$root/release-build/rustress-payout-service.cjs" "$target/rustress-payout-service-0.2.16.cjs";cp "$root/release-build/verify-rustress-payout-active.cjs" "$target/"
cp "$source/Dockerfile" "$source/install.sh" "$source/start-operation.sh" "$source/restore-invoice-only.sh" "$source/monitor-operation.sh" "$source/check-package.sh" "$source"/*.service "$source"/*.timer "$target/"
cp "$root/release-build/review-scoped-payout-operation.cjs" "$target/"
cp "$root/scripts/install-rustress-payout-host-evidence.py" "$target/refresh-host-evidence.py";chmod 755 "$target/refresh-host-evidence.py"
chmod 755 "$target/install.sh" "$target/start-operation.sh" "$target/restore-invoice-only.sh" "$target/monitor-operation.sh" "$target/check-package.sh"
(cd "$target"&&sha256sum Dockerfile rustress-payout-service-0.2.16.cjs verify-rustress-payout-active.cjs review-scoped-payout-operation.cjs refresh-host-evidence.py install.sh start-operation.sh restore-invoice-only.sh monitor-operation.sh check-package.sh *.service *.timer>SHA256SUMS&&./check-package.sh)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-payout-operation-$version"|gzip -n>"$root/release-build/bitcoinwalk-rustress-payout-operation-$version.tar.gz"
printf '%s\n' "$target"
