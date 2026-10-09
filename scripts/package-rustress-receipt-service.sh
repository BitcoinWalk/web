#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.."&&pwd);version=0.1.0;target="$root/release-build/bitcoinwalk-rustress-receipt-service-$version"
rm -rf "$target";mkdir -p "$target"
cp "$root/release-build/rustress-receipt-worker.cjs" "$root/release-build/initialize-rustress-receipt-worker.cjs" "$root/release-build/rustress-receipt-signer.cjs" "$root/release-build/initialize-rustress-receipt-identity.cjs" "$root/release-build/verify-rustress-receipt-worker.cjs" "$root/release-build/verify-rustress-receipt-restore.cjs" "$root/deploy/backup-sqlite-online.mjs" "$target/"
cp "$root/integrations/rustress/receipt-service/Dockerfile.worker" "$root/integrations/rustress/receipt-service/Dockerfile.signer" "$root/integrations/rustress/receipt-service/check-package.sh" "$target/"
cp "$root/integrations/rustress/receipt-service/relay-allowlist.json" "$target/"
cp "$root/integrations/rustress/receipt-service/install-disabled.sh" "$target/install-disabled.sh"
cp "$root/integrations/rustress/receipt-service/bootstrap-provider-identity.sh" "$target/bootstrap-provider-identity.sh"
cp "$root/integrations/rustress/receipt-backup/backup-receipt-state.sh" "$root/integrations/rustress/receipt-backup/verify-receipt-backup-restore.sh" "$root/integrations/rustress/receipt-backup/bitcoinwalk-receipt-backup.service" "$root/integrations/rustress/receipt-backup/bitcoinwalk-receipt-backup.timer" "$target/"
cp "$root/integrations/rustress/payout-backup/receive-encrypted-backup.sh" "$target/offhost-receive-encrypted-backup.sh";cp "$root/integrations/rustress/payout-backup/prune-encrypted-backups.py" "$target/offhost-prune-encrypted-backups.py"
chmod 755 "$target/install-disabled.sh" "$target/bootstrap-provider-identity.sh" "$target/check-package.sh" "$target/backup-receipt-state.sh" "$target/verify-receipt-backup-restore.sh" "$target/offhost-receive-encrypted-backup.sh" "$target/offhost-prune-encrypted-backups.py"
(cd "$target"&&sha256sum Dockerfile.worker Dockerfile.signer relay-allowlist.json install-disabled.sh bootstrap-provider-identity.sh check-package.sh backup-receipt-state.sh verify-receipt-backup-restore.sh bitcoinwalk-receipt-backup.service bitcoinwalk-receipt-backup.timer offhost-receive-encrypted-backup.sh offhost-prune-encrypted-backups.py backup-sqlite-online.mjs rustress-receipt-worker.cjs initialize-rustress-receipt-worker.cjs rustress-receipt-signer.cjs initialize-rustress-receipt-identity.cjs verify-rustress-receipt-worker.cjs verify-rustress-receipt-restore.cjs>SHA256SUMS&&./check-package.sh)
archive="$root/release-build/bitcoinwalk-rustress-receipt-service-$version.tar.gz"
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$root/release-build" -cf - "bitcoinwalk-rustress-receipt-service-$version"|gzip -n >"$archive"
printf '%s\n' "$target"
