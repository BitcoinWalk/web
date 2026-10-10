#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-staging-0.3.251.tar.gz
expected=646fb948720d42da053f004bd68ef32d55b87722087f76c1e23170fb0607918d
helper=/home/bitcoinwalk/bin/deploy-staging-app

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test -x "$helper"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.249"}'
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.251"}'
test "$(curl -fsS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3338/brand/bitcoinwalk-favicon.png)" = 200
test "$(curl -fsS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:3338/brand/bitcoinwalk-admin-favicon.png)" = 200

echo "Staging app 0.3.251 is active with public and admin favicons."
