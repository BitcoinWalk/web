#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.2;target="$root/release-build/bitcoinwalk-rustress-receipt-permanent-$version"
rm -rf "$target";mkdir -p "$target"
cp "$root/integrations/rustress/receipt-permanent/"* "$target/"
chmod 755 "$target/activate.sh" "$target/configure-provider.py"
sh -n "$target/activate.sh";python3 -m py_compile "$target/configure-provider.py"
(cd "$target"&&sha256sum activate.sh configure-provider.py bitcoinwalk-rustress-receipt-proxy.socket bitcoinwalk-rustress-receipt-proxy@.service>SHA256SUMS)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-receipt-permanent-$version"|gzip -n >"$root/release-build/bitcoinwalk-rustress-receipt-permanent-$version.tar.gz"
printf '%s\n' "$target"
