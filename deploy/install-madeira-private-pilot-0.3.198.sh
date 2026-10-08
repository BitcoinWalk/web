#!/bin/bash
# Entirely non-root; installs the exact disabled-only Madeira staging pilot.
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)
current=/opt/bitcoinwalk-app-staging/current
previous=/opt/bitcoinwalk-app-staging/releases/0.3.197-0bada485f078
test "$(readlink -f "$current")" = "$previous" || { echo 'Staging release changed; review required.'; exit 1; }
source_dir=/home/bitcoinwalk/incoming/madeira-private-pilot-0.3.198
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service.d/98-madeira-private-pilot.conf
test ! -e "$dropin" || { echo 'Pilot flag already exists; review required.'; exit 1; }
test -r "$source_dir/madeira-private-pilot.conf"
systemctl --user is-active --quiet bitcoinwalk-rustress-tunnel.service
backup=$(mktemp -d /home/bitcoinwalk/backups/madeira-pilot-enable.XXXXXX)
cp -p /home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-staging.service "$backup/service.before"
rollback(){
  status=$?
  if test "$status" -ne 0; then
    test ! -e "$dropin" || mv "$dropin" "$backup/disabled-pilot.conf"
    if test "$(readlink -f "$current")" != "$previous"; then
      ln -s "$previous" "$current.rollback.$$"
      mv -Tf "$current.rollback.$$" "$current"
    fi
    systemctl --user daemon-reload
    systemctl --user restart bitcoinwalk-app-staging.service
    echo "Pilot activation failed; restored previous staging release. Evidence: $backup"
  fi
  exit "$status"
}
trap rollback EXIT
install -D -m 600 "$source_dir/madeira-private-pilot.conf" "$dropin"
systemctl --user daemon-reload
/home/bitcoinwalk/bin/deploy-staging-app "$source_dir/app-staging-0.3.198.tar.gz"
curl --fail --silent --max-time 10 http://127.0.0.1:3338/admin/madeira-pilot >/dev/null
status=$(curl --silent --max-time 10 -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://app-staging.bitcoinwalk.org' -H 'Content-Type: application/json' --data '{}' http://127.0.0.1:3338/api/madeira-pilot)
test "$status" = 403
trap - EXIT
echo "Madeira-only private staging pilot enabled as bitcoinwalk. Evidence: $backup"
