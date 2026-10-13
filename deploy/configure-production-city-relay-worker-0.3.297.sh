#!/bin/sh
# Add the production-side paid-city relay queue boundary without putting the
# bearer credential in an environment file or granting the app Docker access.
set -eu

test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk.' >&2; exit 1; }
test "$#" -eq 1 || { echo "Usage: $0 /absolute/path/to/shared-token" >&2; exit 1; }
case "$1" in /*) token=$1;; *) echo 'Token path must be absolute.' >&2; exit 1;; esac
test "$(readlink -f "$token")" = "$token" && test -f "$token" && test ! -L "$token"
test "$(stat -c %a "$token")" = 600
test "$(stat -c %U "$token")" = bitcoinwalk
value=$(cat "$token")
case "$value" in *[!A-Za-z0-9_-]*|'') echo 'Invalid provisioning credential.' >&2; exit 1;; esac
test "${#value}" -ge 43 && test "${#value}" -le 256

config=/home/bitcoinwalk/.config/bitcoinwalk/production.env
backup=$(mktemp -d /home/bitcoinwalk/backups/city-relay-worker-config.XXXXXX)
chmod 0700 "$backup"
cp -p "$config" "$backup/production.env.before"
next=$config.next
trap 'rm -f "$next"' EXIT HUP INT TERM
awk '!/^BITCOINWALK_RELAY_PROVISION_ENABLED=/ && !/^BITCOINWALK_RELAY_PROVISION_TOKEN_FILE=/' "$config" >"$next"
printf '%s\n' \
 'BITCOINWALK_RELAY_PROVISION_ENABLED=1' \
 "BITCOINWALK_RELAY_PROVISION_TOKEN_FILE=$token" >>"$next"
chmod 0600 "$next"
mv "$next" "$config"
trap - EXIT HUP INT TERM

grep -Fxq 'BITCOINWALK_RELAY_PROVISION_ENABLED=1' "$config"
grep -Fxq "BITCOINWALK_RELAY_PROVISION_TOKEN_FILE=$token" "$config"
test "$(grep -c '^BITCOINWALK_RELAY_PROVISION_' "$config")" -eq 2
echo "Production paid-city relay queue boundary configured. Backup: $backup"
echo 'The app remains non-root and has no Docker socket access; restart it through the normal release deployment.'
