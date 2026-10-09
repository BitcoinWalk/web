#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
source="$root/../BitcoinWalk-rustress/target/release/rustress"
version=0.1.2
target="$root/release-build/bitcoinwalk-rustress-managed-$version"
[ -x "$source" ]
rm -rf "$target"
mkdir -p "$target"
cp "$source" "$target/rustress"
cp "$root/integrations/rustress/install-managed.py" "$target/install-managed.py"
cp "$root/integrations/rustress/verify-managed.py" "$target/verify-managed.py"
chmod 700 "$target/rustress"
chmod 755 "$target/install-managed.py" "$target/verify-managed.py"
(cd "$target" && sha256sum rustress install-managed.py verify-managed.py > SHA256SUMS)
tar -C "$root/release-build" -czf "$root/release-build/bitcoinwalk-rustress-managed-$version.tar.gz" "bitcoinwalk-rustress-managed-$version"
printf '%s\n' "$target"
