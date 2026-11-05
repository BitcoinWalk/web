#!/bin/bash
set -euo pipefail
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk on Relays, without sudo.' >&2; exit 1; }
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
umask 077
credential_dir=$(mktemp -d)
trap 'rm -f "$credential_dir/openai-key"; rmdir "$credential_dir"' EXIT
if test "$#" -eq 0; then
 echo 'This evaluates 21 synthetic questions using gpt-6.1-sol. No chat messages will be sent.'
elif test "$#" -eq 2 && test "$1" = --case; then
 echo 'Single-case diagnostic: at most one model call; this is not full-suite acceptance.'
elif test "$#" -eq 2 && test "$1" = --from; then
 echo 'Partial suite from the selected question onward; this is not full-suite acceptance.'
else
 echo 'Usage: bash evaluate-guide-private-pilot.sh [--case TEST_ID | --from TEST_ID]' >&2; exit 1
fi
read -rsp 'OpenAI API key: ' guide_api_key
echo
test -n "$guide_api_key"
printf '%s\n' "$guide_api_key" > "$credential_dir/openai-key"
unset guide_api_key
env CREDENTIALS_DIRECTORY="$credential_dir" \
 GUIDE_KNOWLEDGE="$release/knowledge.json" \
 GUIDE_AI_MODEL=gpt-6.1-sol \
 /opt/bitcoinwalk-app-staging/runtime/bin/node "$release/check-guide-ai-evaluation.cjs" "$@"
