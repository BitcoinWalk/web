#!/bin/bash
# Non-root staging release: install a maximum-15-minute, auto-closing Madeira public gateway control.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
previous=/opt/bitcoinwalk-app-staging/releases/0.3.202-3d0d54533d75
archive=/home/bitcoinwalk/incoming/app-staging-0.3.203.tar.gz
control=/home/bitcoinwalk/incoming/control-madeira-staging-activation.py
test "$(readlink -f "$current")" = "$previous" || { echo 'Staging release changed; review required.'; exit 1; }
test -f "$control" && test ! -L "$control"
! grep -RqsE '^Environment=BITCOINWALK_RUSTRESS_ACTIVATION_ENABLED=1$' /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d
target=/home/bitcoinwalk/.local/libexec/bitcoinwalk-madeira-public-window
mkdir -p "$target";chmod 700 "$target";install -m 700 "$control" "$target/control.py"
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-public-window.XXXXXX)
rollback(){ status=$?;if test "$status" -ne 0;then
  rm -f /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/110-madeira-public-activation-window.conf
  rm -f /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/zz-madeira-public-activation-window.conf
  if test "$(readlink -f "$current")" != "$previous";then ln -s "$previous" "$current.rollback.$$";mv -Tf "$current.rollback.$$" "$current";systemctl --user restart bitcoinwalk-app-staging.service;fi
  echo "Public-window deployment failed; restored 0.3.202. Evidence: $backup";fi;exit "$status"; }
trap rollback EXIT
/home/bitcoinwalk/bin/deploy-staging-app "$archive"
test "$(curl -fsS --max-time 10 http://127.0.0.1:3338/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-staging-0.3.203"}'
test "$(curl -fsS --max-time 10 'http://127.0.0.1:3338/.well-known/nostr.json?name=madeira')" = '{"names":{}}'
test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3338/.well-known/lnurlp/madeira)" = 404
trap - EXIT
echo "App 0.3.203 is active with Madeira public gateway closed. Evidence: $backup"
