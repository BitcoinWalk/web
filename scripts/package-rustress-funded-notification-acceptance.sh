#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version=0.1.0
target="$root/release-build/bitcoinwalk-rustress-funded-notification-$version"
rm -rf "$target"
mkdir -p "$target"
cp "$root/release-build/rustress-funded-notification-acceptance.cjs" "$target/"
(cd "$target" && sha256sum rustress-funded-notification-acceptance.cjs > SHA256SUMS)
printf '%s\n' "$target"
