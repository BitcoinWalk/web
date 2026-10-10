#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-staging-0.3.252.tar.gz
expected=47fb1601b53c743d9e5d732b0f2f11c5478a679d8eb5bbde6f27bec27708d2fe
helper=/home/bitcoinwalk/bin/deploy-staging-app

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.251"}'
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.252"}'

echo "Staging app 0.3.252 is active with weather attribution in walk footers."
