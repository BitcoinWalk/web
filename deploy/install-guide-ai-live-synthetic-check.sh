#!/bin/sh
set -eu

release=${1:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}
test "$(id -u)" -eq 0 || { echo "Run as root." >&2; exit 1; }
cd "$release"
sha256sum -c SHA256SUMS
install -d -o root -g root -m 0755 /opt/bitcoinwalk-guide
install -o root -g root -m 0755 check-guide-ai-live-synthetic.cjs /opt/bitcoinwalk-guide/check-bw152-live-synthetic.cjs
install -o root -g root -m 0600 knowledge.json /opt/bitcoinwalk-guide/knowledge-bw152.json
echo "BW-152 one-shot synthetic evaluator installed. No credential, model configuration, service, timer or sending path was installed."
