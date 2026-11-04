#!/bin/bash
set -euo pipefail
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk on 138, without sudo.' >&2; exit 1; }
umask 077
credential_dir=$(mktemp -d /home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging/evaluation.XXXXXX)
trap 'rm -f "$credential_dir/openai-key"; rmdir "$credential_dir"' EXIT
read -rsp 'OpenAI API key: ' guide_key
echo
test -n "$guide_key"
printf '%s\n' "$guide_key" > "$credential_dir/openai-key"
unset guide_key
env CREDENTIALS_DIRECTORY="$credential_dir" \
 GUIDE_KNOWLEDGE=/home/bitcoinwalk/.local/lib/bitcoinwalk-guide-policy-staging/knowledge.json \
 GUIDE_AI_MODEL=gpt-6.1-sol \
 /opt/bitcoinwalk-app-staging/runtime/bin/node /home/bitcoinwalk/.local/lib/bitcoinwalk-guide-policy-staging/check-guide-ai-evaluation.cjs
