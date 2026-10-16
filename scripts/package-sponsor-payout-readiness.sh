#!/usr/bin/env sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.0;target="$root/release-build/bitcoinwalk-sponsor-payout-readiness-$version"
rm -rf "$target";mkdir -p "$target"
npx esbuild "$root/scripts/run-sponsor-payout-nwc-read-probe.ts" --bundle --platform=node --target=node24 --format=cjs --outfile="$target/sponsor-payout-nwc-read-probe.cjs" >/dev/null
cp "$root/integrations/sponsor-payout-readiness/"*.sh "$target/"
chmod 755 "$target/"*.sh
(cd "$target"&&sha256sum install-tools.sh install-nwc-secret.sh check-nwc-secret.sh run-readiness-probe.sh sponsor-payout-nwc-read-probe.cjs > SHA256SUMS&&sha256sum -c SHA256SUMS)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-sponsor-payout-readiness-$version"|gzip -n > "$root/release-build/bitcoinwalk-sponsor-payout-readiness-$version.tar.gz"
printf '%s\n' "$target"
