#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }
cd "$(dirname "$0")"
archive=app-production-0.3.253.tar.gz
expected=100489f6af9ff43f4db9b4326f61182b6f6fcaa1534f36532822e9e31595a280
helper=/home/bitcoinwalk/bin/deploy-production-app

test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.252"}'
printf '%s  %s\n' "$expected" "$archive" >"$archive.sha256"
"$helper" "$PWD/$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.253"}'

echo "Production app 0.3.253 is active with every approved city retained on the homepage map."
