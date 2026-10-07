#!/bin/bash
# One-time, non-root production app preparation on .138.
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk.' >&2; exit 1; }
test "$#" -eq 1 || { echo 'Usage: bootstrap-production-app-user.sh /path/to/app-production-X.Y.Z.tar.gz' >&2; exit 1; }
script_dir=$(cd "$(dirname "$0")" && pwd)
archive=$(readlink -f "$1")
root=/home/bitcoinwalk/apps/bitcoinwalk-production
config=/home/bitcoinwalk/.config/bitcoinwalk
user_units=/home/bitcoinwalk/.config/systemd/user
state=/home/bitcoinwalk/.local/state/bitcoinwalk-production
share=/home/bitcoinwalk/.local/share/bitcoinwalk-production
backup_root=/home/bitcoinwalk/backups
runtime_source=/opt/bitcoinwalk-app-staging/runtime/bin/node
export XDG_RUNTIME_DIR=/run/user/$(id -u)

test -x "$runtime_source"
test -f /var/lib/bitcoinwalk-app-staging/payments.sqlite
mkdir -p "$root/releases" "$root/runtime/bin" /home/bitcoinwalk/.cache/bitcoinwalk-app-production "$state" "$share/media" "$share/city-logos" "$config" "$user_units" "$backup_root" /home/bitcoinwalk/bin
install -m 0755 "$runtime_source" "$root/runtime/bin/node"
install -m 0755 "$script_dir/deploy-production-app-user.sh" /home/bitcoinwalk/bin/deploy-production-app
install -m 0644 "$script_dir/bitcoinwalk-app-production.user.service" "$user_units/bitcoinwalk-app-production.service"
install -m 0644 "$script_dir/backup-sqlite-online.mjs" /home/bitcoinwalk/bin/backup-sqlite-online.mjs

cat >"$config/production.env.next" <<'EOF'
BITCOINWALK_PAYMENT_DATABASE=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
BITCOINWALK_PAYMENT_APP_ORIGIN=https://bitcoinwalk.org
BITCOINWALK_CITY_LOGO_DIR=/home/bitcoinwalk/.local/share/bitcoinwalk-production/city-logos
BITCOINWALK_CITY_LOGO_RENDERER=/home/bitcoinwalk/bin/render-city-logo-pack
EOF
chmod 0600 "$config/production.env.next"
mv "$config/production.env.next" "$config/production.env"
test -f "$config/production-release.env" || { printf 'BITCOINWALK_APP_RELEASE=app-production-pending\n' >"$config/production-release.env"; chmod 0600 "$config/production-release.env"; }

if test ! -f "$state/payments.sqlite"; then
  "$root/runtime/bin/node" /home/bitcoinwalk/bin/backup-sqlite-online.mjs /var/lib/bitcoinwalk-app-staging/payments.sqlite "$state/payments.sqlite"
fi
if test -d /var/lib/bitcoinwalk-app-media; then cp -a /var/lib/bitcoinwalk-app-media/. "$share/media/"; fi
if test -d /home/bitcoinwalk/.local/share/bitcoinwalk/city-logos; then cp -a /home/bitcoinwalk/.local/share/bitcoinwalk/city-logos/. "$share/city-logos/"; fi

systemctl --user daemon-reload
/home/bitcoinwalk/bin/deploy-production-app "$archive"
echo 'Non-root production app bootstrap accepted on loopback 127.0.0.1:3345.'
