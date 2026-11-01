#!/bin/bash
set -euo pipefail
umask 077
test "$(id -u)" = 0 || { echo 'Run this installer with sudo.' >&2; exit 1; }
root=$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)
cd "$root"
sha256sum -c SHA256SUMS
target=/opt/bitcoinwalk-city-revision-automation/0.1.0
test ! -e "$target" || { echo 'City revision automation 0.1.0 is already installed.' >&2; exit 1; }
install -d -o root -g root -m 0755 "$target"
install -o root -g root -m 0644 city-revision-automation.cjs OPERATIONS.md SHA256SUMS "$target/"
install -o root -g root -m 0755 check-staging.sh "$target/"
test ! -e /etc/systemd/system/bitcoinwalk-city-revision-automation.service
test ! -e /etc/systemd/system/bitcoinwalk-city-revision-automation.timer
test ! -e "$target/policy.json"
test ! -e "$target/signer-key"
echo 'Installed and verified DISABLED. No signer, policy, service or timer was installed.'
echo "Read-only staging check: $target/check-staging.sh"
