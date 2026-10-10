#!/bin/bash
# Non-root staging release for the isolated root-domain NIP-05 binding.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
previous=/opt/bitcoinwalk-app-staging/releases/0.3.210-40dfb7e03cff
archive=/home/bitcoinwalk/incoming/app-staging-0.3.211.tar.gz
controller=/home/bitcoinwalk/incoming/control-madeira-staging-activation.py
test "$(readlink -f "$current")" = "$previous" || { echo 'Staging release changed; review required.'; exit 1; }
test -f "$controller" && test ! -L "$controller"
test ! -e /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/110-madeira-public-activation-window.conf
test ! -e /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-public-activation-window.conf
install -m 700 "$controller" /home/bitcoinwalk/.local/libexec/bitcoinwalk-madeira-public-window/control.py
backup=$(mktemp -d /home/bitcoinwalk/backups/root-nip05-staging.XXXXXX)
rollback(){ status=$?;if test "$status" -ne 0;then
  if test "$(readlink -f "$current")" != "$previous";then ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current";systemctl --user restart bitcoinwalk-app-staging.service;fi
  echo "Root NIP-05 staging deployment failed; restored 0.3.210. Evidence: $backup";fi;exit "$status"; }
trap rollback EXIT
/home/bitcoinwalk/bin/deploy-staging-app "$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.211"}'
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3338/.well-known/nostr.json?name=_')" = '{"names":{}}'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3338/.well-known/lnurlp/_)" = 404
trap - EXIT
echo "App 0.3.211 is active on staging with public identity gates closed. Evidence: $backup"
