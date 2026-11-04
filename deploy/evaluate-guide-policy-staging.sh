#!/bin/bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run with sudo on 138.' >&2; exit 1; }
umask 077
credential=/etc/bitcoinwalk-guide-policy-staging/openai-key
test ! -e "$credential"
read -rsp 'OpenAI API key: ' guide_key
echo
test -n "$guide_key"
trap 'rm -f /etc/bitcoinwalk-guide-policy-staging/openai-key' EXIT
printf '%s\n' "$guide_key" > "$credential"
unset guide_key
systemd-run --unit=bitcoinwalk-guide-bw152-staging-topics --wait --pipe --collect \
 -p DynamicUser=yes -p LoadCredential=openai-key:/etc/bitcoinwalk-guide-policy-staging/openai-key \
 -p Environment=GUIDE_KNOWLEDGE=/opt/bitcoinwalk-guide-policy-staging/knowledge.json \
 -p Environment=GUIDE_AI_MODEL=gpt-6.1-sol -p NoNewPrivileges=yes -p PrivateTmp=yes \
 /opt/bitcoinwalk-app-staging/runtime/bin/node /opt/bitcoinwalk-guide-policy-staging/check-guide-ai-evaluation.cjs
