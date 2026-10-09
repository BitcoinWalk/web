#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version=0.1.1
target="$root/release-build/bitcoinwalk-rustress-wallet-shadow-$version"
rm -rf "$target"
mkdir -p "$target"
cp "$root/release-build/rustress-wallet-shadow.cjs" "$target/"
cp "$root/release-build/verify-rustress-wallet-shadow.cjs" "$target/"
cp "$root/integrations/rustress/live-wallet/Dockerfile.shadow" "$target/"
cp "$root/integrations/rustress/live-wallet/install-wallet-shadow.sh" "$target/install.sh"
chmod 755 "$target/install.sh"
(cd "$target" && sha256sum Dockerfile.shadow install.sh rustress-wallet-shadow.cjs verify-rustress-wallet-shadow.cjs > SHA256SUMS)
printf '%s\n' "$target"
