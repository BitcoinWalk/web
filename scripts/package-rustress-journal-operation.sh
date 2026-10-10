#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.1;target="$root/release-build/bitcoinwalk-rustress-journal-operation-$version";source="$root/integrations/rustress/journal-operation"
rm -rf "$target";mkdir -p "$target";cp "$root/release-build/control-production-journal-operation.cjs" "$target/control.cjs";cp "$source"/* "$target/";chmod 755 "$target"/*.sh
(cd "$target"&&sha256sum control.cjs *.sh *.service *.timer>SHA256SUMS&&./check-package.sh)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-journal-operation-$version"|gzip -n>"$root/release-build/bitcoinwalk-rustress-journal-operation-$version.tar.gz"
printf '%s\n' "$target"
