#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
"$node" "$release/check-guide-persistent-pro.cjs" "$release/knowledge.json"
"$node" "$release/upgrade-guide-reviewed-questions.cjs"
