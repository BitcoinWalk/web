#!/bin/bash
set -euo pipefail
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk on 138, without sudo.' >&2; exit 1; }
export STATE_DIRECTORY=/home/bitcoinwalk/.local/share/bitcoinwalk-guide-policy-staging
export CREDENTIALS_DIRECTORY=/home/bitcoinwalk/.config/bitcoinwalk-guide-policy-staging
export GUIDE_STAGING_PRO_PUBKEY=4506e04e4b7079ce07e38e9875678a81ad33a456c696d708ef8e9a2d8c16ba04
exec /opt/bitcoinwalk-app-staging/runtime/bin/node /home/bitcoinwalk/.local/lib/bitcoinwalk-guide-policy-staging/check-guide-policy-staging.cjs
