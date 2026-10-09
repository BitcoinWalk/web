#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version=0.1.0
target="$root/release-build/bitcoinwalk-rustress-payout-service-$version"
rm -rf "$target"
mkdir -p "$target"
cp "$root/release-build/rustress-payout-service.cjs" "$target/"
cp "$root/release-build/verify-rustress-payout-service.cjs" "$target/"
cp "$root/integrations/rustress/payout-service/Dockerfile" "$target/"
cp "$root/integrations/rustress/payout-service/install-payout-service.sh" "$target/install.sh"
chmod 755 "$target/install.sh"
(cd "$target" && sha256sum Dockerfile install.sh rustress-payout-service.cjs verify-rustress-payout-service.cjs > SHA256SUMS)
tar -C "$root/release-build" -czf "$root/release-build/bitcoinwalk-rustress-payout-service-$version.tar.gz" "bitcoinwalk-rustress-payout-service-$version"
printf '%s\n' "$target"
