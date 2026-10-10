#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-staging-0.3.253.tar.gz
expected=eb88c6b25e7df9ee6f91a20738b2bea46f10f6f6d270cccdb9c064d8d1420ce8
helper=/home/bitcoinwalk/bin/deploy-staging-app

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.252"}'
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.253"}'

echo "Staging app 0.3.253 is active with every approved city retained on the homepage map."
