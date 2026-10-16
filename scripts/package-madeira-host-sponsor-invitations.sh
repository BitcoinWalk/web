#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd)
version=0.3.393
name=bitcoinwalk-madeira-host-sponsor-invitations-$version
target=$root/release-build/$name
archive=$root/release-build/app-staging-$version.tar.gz

test -f "$archive"
rm -rf "$target"
mkdir -p "$target/deploy"
cp "$archive" "$target/"
cp "$root/deploy/enable-madeira-host-sponsor-invitations-$version.sh" "$target/deploy/"
chmod 0755 "$target/deploy/enable-madeira-host-sponsor-invitations-$version.sh"
(cd "$target"&&sha256sum "app-staging-$version.tar.gz" "deploy/enable-madeira-host-sponsor-invitations-$version.sh" >SHA256SUMS&&sha256sum -c SHA256SUMS)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "$name"|gzip -n >"$root/release-build/$name.tar.gz"
sha256sum "$root/release-build/$name.tar.gz"
