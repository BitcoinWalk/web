#!/bin/bash
set -euo pipefail
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk on 138, without sudo.' >&2; exit 1; }
umask 077
credential=/home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging/openai-key
test ! -e "$credential"
read -rsp 'OpenAI API key: ' guide_key
echo
test -n "$guide_key"
trap 'rm -f /home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging/openai-key' EXIT
printf '%s\n' "$guide_key" > "$credential"
unset guide_key
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemd-run --user --unit=bitcoinwalk-guide-bw152-staging-topics --wait --pipe --collect \
 -p LoadCredential=openai-key:/home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging/openai-key \
 -p Environment=GUIDE_KNOWLEDGE=/home/bitcoinwalk/.local/lib/bitcoinwalk-guide-policy-staging/knowledge.json \
 -p Environment=GUIDE_AI_MODEL=gpt-6.1-sol -p NoNewPrivileges=yes \
 /opt/bitcoinwalk-app-staging/runtime/bin/node /home/bitcoinwalk/.local/lib/bitcoinwalk-guide-policy-staging/check-guide-ai-evaluation.cjs
