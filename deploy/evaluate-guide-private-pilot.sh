#!/bin/bash
set -euo pipefail
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk on Relays, without sudo.' >&2; exit 1; }
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
umask 077
credential_dir=$(mktemp -d)
trap 'rm -f "$credential_dir/openai-key"; rmdir "$credential_dir"' EXIT
echo 'This evaluates 21 synthetic questions using gpt-6.1-sol. No chat messages will be sent.'
read -rsp 'OpenAI API key: ' guide_api_key
echo
test -n "$guide_api_key"
printf '%s\n' "$guide_api_key" > "$credential_dir/openai-key"
unset guide_api_key
env CREDENTIALS_DIRECTORY="$credential_dir" \
 GUIDE_KNOWLEDGE="$release/knowledge.json" \
 GUIDE_AI_MODEL=gpt-6.1-sol \
 /opt/bitcoinwalk-app-staging/runtime/bin/node "$release/check-guide-ai-evaluation.cjs"
