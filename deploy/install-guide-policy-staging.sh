#!/bin/bash
set -euo pipefail
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk on 138, without sudo.' >&2; exit 1; }
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
target=/home/bitcoinwalk/.local/lib/bitcoinwalk-guide-policy-staging
install -d -m 0700 "$target" /home/bitcoinwalk/.local/share/bitcoinwalk-guide-policy-staging /home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging
for file in guide.cjs check-guide-policy-staging.cjs check-guide-ai-evaluation.cjs; do
 install -m 0700 "$file" "$target/$file"
done
install -m 0600 knowledge.json "$target/knowledge.json"
if test ! -e /home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging/guide-key; then
 /opt/bitcoinwalk-app-staging/runtime/bin/node "$release/guide-key.cjs" /home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging/guide-key
fi
echo 'Isolated staging Guide tools installed. Production worker, configuration and conversations unchanged. No model call or message sent.'
