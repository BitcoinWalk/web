#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd)
version=0.3.398
name=bitcoinwalk-pro-sponsor-eligibility-$version
target=$root/release-build/$name
archive=$root/release-build/app-staging-$version.tar.gz

test -f "$archive"
npm run sponsor:madeira-eligibility:build
rm -rf "$target"
mkdir -p "$target/deploy"
cp "$archive" "$target/"
cp "$root/release-build/mirror-madeira-sponsor-eligibility.mjs" "$target/"
cp "$root/deploy/repair-pro-sponsor-eligibility-$version.sh" "$target/deploy/"
hash=$(sha256sum "$archive"|cut -d' ' -f1)
sed -i "s/APP_ARCHIVE_SHA256/$hash/" "$target/deploy/repair-pro-sponsor-eligibility-$version.sh"
chmod 0755 "$target/deploy/repair-pro-sponsor-eligibility-$version.sh"
(cd "$target"&&sha256sum "app-staging-$version.tar.gz" mirror-madeira-sponsor-eligibility.mjs "deploy/repair-pro-sponsor-eligibility-$version.sh" >SHA256SUMS&&sha256sum -c SHA256SUMS)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "$name"|gzip -n >"$root/release-build/$name.tar.gz"
sha256sum "$root/release-build/$name.tar.gz"
