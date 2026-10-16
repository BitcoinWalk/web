#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
previous=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.403-39025b7ef9ae
archive=/home/bitcoinwalk/incoming/app-production-0.3.404.tar.gz
test "$(readlink -f "$current")" = "$previous"
test "$(curl -fsS --max-time 5 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.403"}'
test "$(curl -fsS --max-time 10 -H 'Host: bitcoinwalk.org' http://127.0.0.1:18895/.well-known/lnurlp/guide | grep -c 'bitcoinwalk.org/lnurlp/guide/callback')" = 1
/home/bitcoinwalk/bin/deploy-production-app "$archive"
test "$(curl -fsS --max-time 5 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.404"}'
for name in endo donate guide;do
  metadata=$(curl -fsS --max-time 15 "https://bitcoinwalk.org/.well-known/lnurlp/$name")
  echo "$metadata" | grep -Fq "https://bitcoinwalk.org/lnurlp/$name/callback"
  echo "$metadata" | grep -Fq '"allowsNostr":true'
  invoice=$(curl -fsS --max-time 20 "https://bitcoinwalk.org/lnurlp/$name/callback?amount=1000")
  echo "$invoice" | grep -q '"pr":"lnbc'
done
echo "STANDALONE_LNURL_PRODUCTION_0.3.404_OK"
