#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
status=0
systemctl disable --now bitcoinwalk-guide-auto-pro.service || status=$?
/opt/bitcoinwalk-app-staging/runtime/bin/node /opt/bitcoinwalk-guide-auto-pro/current/prepare-guide-persistent-pro.cjs --disable || status=$?
echo 'Persistent Pro assistant stop requested. Normal Guide, quota records and stored credential retained; no counters reset.'
exit "$status"
