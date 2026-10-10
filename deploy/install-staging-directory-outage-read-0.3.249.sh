#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-staging-0.3.249.tar.gz
expected=2951f8ee70c7fef2fe7963bd6613c88aaab42ef73e9e115c574037c673b953d7
helper=/home/bitcoinwalk/bin/deploy-staging-app
current=/opt/bitcoinwalk-app-staging/current

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test -x "$helper"
previous=$(readlink -f "$current")
test "$previous" = /opt/bitcoinwalk-app-staging/releases/0.3.248-c52be61012f2
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.248"}'

printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.249"}'
pid=$(systemctl --user show bitcoinwalk-app-staging.service -p MainPID --value)
test "$pid" -gt 0
grep -zqx 'BITCOINWALK_SERVER_READ_RELAY=ws://127.0.0.1:3334' "/proc/$pid/environ"
grep -zqx 'BITCOINWALK_SERVER_DIRECTORY_READ_RELAY=ws://127.0.0.1:3343/' "/proc/$pid/environ"

echo "Staging app 0.3.249 and outage-tolerant read-only directory authorization are active."
