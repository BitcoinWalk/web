#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.6;target="$root/release-build/bitcoinwalk-rustress-receipt-window-$version"
rm -rf "$target";mkdir -p "$target"
cp "$root/integrations/rustress/receipt-window/activate-window.sh" "$root/integrations/rustress/receipt-window/rollback-window.sh" "$root/integrations/rustress/receipt-window/configure-provider.py" "$root/integrations/rustress/receipt-service/relay-allowlist.json" "$target/"
chmod 755 "$target/activate-window.sh" "$target/rollback-window.sh" "$target/configure-provider.py"
sh -n "$target/activate-window.sh";sh -n "$target/rollback-window.sh";python3 -m py_compile "$target/configure-provider.py"
(cd "$target"&&sha256sum activate-window.sh rollback-window.sh configure-provider.py relay-allowlist.json>SHA256SUMS)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-receipt-window-$version"|gzip -n >"$root/release-build/bitcoinwalk-rustress-receipt-window-$version.tar.gz"
printf '%s\n' "$target"
