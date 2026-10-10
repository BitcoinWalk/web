#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.0;target="$root/release-build/bitcoinwalk-rustress-payout-watchdog-$version";source="$root/integrations/rustress/payout-watchdog"
rm -rf "$target";mkdir -p "$target";cp "$source"/* "$target/";chmod 755 "$target"/*.sh
(cd "$target"&&sha256sum *.sh *.service>SHA256SUMS&&./check-package.sh)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-payout-watchdog-$version"|gzip -n>"$root/release-build/bitcoinwalk-rustress-payout-watchdog-$version.tar.gz"
printf '%s\n' "$target"
