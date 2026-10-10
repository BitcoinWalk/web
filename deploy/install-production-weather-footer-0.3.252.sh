#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-production-0.3.252.tar.gz
expected=cd530690918679140155755504b9d9e2bc9d5998824c4600efd5f47af9baf9f2
helper=/home/bitcoinwalk/bin/deploy-production-app

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.251"}'
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.252"}'

echo "Production app 0.3.252 is active with weather attribution in walk footers."
