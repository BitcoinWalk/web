#!/bin/bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run with sudo on 138.' >&2; exit 1; }
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
target=/opt/bitcoinwalk-guide-policy-staging
install -d -o root -g root -m 0755 "$target"
for file in guide.cjs check-guide-policy-staging.cjs check-guide-ai-evaluation.cjs; do
 install -o root -g root -m 0755 "$file" "$target/$file"
done
install -o root -g root -m 0644 knowledge.json "$target/knowledge.json"
install -d -o root -g root -m 0700 /etc/bitcoinwalk-guide-policy-staging
echo 'Isolated staging Guide tools installed. Production worker, configuration and conversations unchanged. No model call or message sent.'
