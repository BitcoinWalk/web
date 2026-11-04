#!/bin/bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run with sudo on 138.' >&2; exit 1; }
systemd-run --unit=bitcoinwalk-guide-bw152-staging-policy --wait --pipe --collect \
 -p DynamicUser=yes -p StateDirectory=bitcoinwalk-guide-policy-staging -p StateDirectoryMode=0700 \
 -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
 -p Environment=GUIDE_STAGING_PRO_PUBKEY=4506e04e4b7079ce07e38e9875678a81ad33a456c696d708ef8e9a2d8c16ba04 \
 -p NoNewPrivileges=yes -p PrivateTmp=yes \
 /opt/bitcoinwalk-app-staging/runtime/bin/node /opt/bitcoinwalk-guide-policy-staging/check-guide-policy-staging.cjs
