#!/bin/bash
# Non-root staging release: separate NIP-05 publication from Lightning paths.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
previous=/opt/bitcoinwalk-app-staging/releases/0.3.208-92661e213a64
archive=/home/bitcoinwalk/incoming/app-staging-0.3.209.tar.gz
controller=/home/bitcoinwalk/incoming/control-madeira-staging-activation.py
test "$(readlink -f "$current")" = "$previous" || { echo 'Staging release changed; review required.'; exit 1; }
test -f "$controller" && test ! -L "$controller"
test ! -e /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/110-madeira-public-activation-window.conf
test ! -e /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-public-activation-window.conf
install -m 700 "$controller" /home/bitcoinwalk/.local/libexec/bitcoinwalk-madeira-public-window/control.py
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-public-gates.XXXXXX)
rollback(){ status=$?;if test "$status" -ne 0;then
  rm -f /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/110-madeira-public-activation-window.conf
  rm -f /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-public-activation-window.conf
  if test "$(readlink -f "$current")" != "$previous";then ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current";systemctl --user restart bitcoinwalk-app-staging.service;fi
  echo "Public-gate deployment failed; restored 0.3.208. Evidence: $backup";fi;exit "$status"; }
trap rollback EXIT
/home/bitcoinwalk/bin/deploy-staging-app "$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.209"}'
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3338/.well-known/nostr.json?name=madeira')" = '{"names":{}}'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3338/.well-known/lnurlp/madeira)" = 404
trap - EXIT
echo "App 0.3.209 is active with independent public gates closed. Evidence: $backup"
