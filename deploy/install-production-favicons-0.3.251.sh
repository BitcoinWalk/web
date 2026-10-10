#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-production-0.3.251.tar.gz
expected=fee49fdb121168584bd25710f43bd4a26b563480ca1384d8d58f5f391c9baf0c
helper=/home/bitcoinwalk/bin/deploy-production-app

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test -x "$helper"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.248"}'
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.251"}'
test "$(curl -fsS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3345/brand/bitcoinwalk-favicon.png)" = 200
test "$(curl -fsS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3345/brand/bitcoinwalk-admin-favicon.png)" = 200

echo "Production app 0.3.251 is active with public and admin favicons."
