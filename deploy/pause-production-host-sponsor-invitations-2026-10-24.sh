#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo "Run as bitcoinwalk." >&2; exit 1; }

service=bitcoinwalk-app-production.service
current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
expected=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.507-b02c260cfb6a
dropin=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-production.service.d/zz-madeira-host-sponsor-invitations.conf

test "$(readlink -f "$current")" = "$expected"
test -f "$dropin"
grep -qx 'Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=1' "$dropin"
grep -qx 'Environment=BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=83f15504-9fca-4d59-a0f6-616a559510df' "$dropin"

backup=$(mktemp -d /home/bitcoinwalk/backups/host-sponsor-invitations-pause.XXXXXX)
cp -p "$dropin" "$backup/feature-flags.before.conf"
printf '%s\n' "$expected" >"$backup/current.before"
cat >"$backup/feature-flags.paused.conf" <<'EOF'
[Service]
UnsetEnvironment=BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS
EOF
chmod 0600 "$backup/feature-flags.paused.conf"

rollback(){
 status=$?
 if test "$status" -ne 0; then
  install -m 0600 "$backup/feature-flags.before.conf" "$dropin"
  systemctl --user daemon-reload
  systemctl --user restart "$service" || true
  echo "Host sponsor invitation pause failed; previous feature flags restored. Evidence: $backup" >&2
 fi
 exit "$status"
}
trap rollback EXIT INT TERM HUP

install -m 0600 "$backup/feature-flags.paused.conf" "$dropin"
systemctl --user daemon-reload
systemctl --user restart "$service"
test "$(systemctl --user is-active "$service")" = active
pid=$(systemctl --user show "$service" -p MainPID --value)
test "$pid" -gt 0
if grep -Fzq 'BITCOINWALK_SPONSOR_HOST_PAYOUT_ENABLED=' "/proc/$pid/environ"; then exit 1; fi
if grep -Fzq 'BITCOINWALK_SPONSOR_HOST_PAYOUT_CITY_IDS=' "/proc/$pid/environ"; then exit 1; fi
test "$(readlink -f "$current")" = "$expected"

trap - EXIT INT TERM HUP
echo "New production host sponsor invitations are paused. Existing orders and payout obligations were not changed. Evidence: $backup"
