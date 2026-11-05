#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run with sudo on Relays.' >&2; exit 1; }
umask 077
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
unit=bitcoinwalk-guide-test1-pilot.service
policy=/etc/bitcoinwalk-guide/private-pilot-policy.json
test ! -e "$policy" || { echo 'A pilot policy already exists; refusing renewal/reset. Review it first.' >&2; exit 1; }
systemctl is-active --quiet bitcoinwalk-guide.service || { echo 'Normal Guide worker is not active.' >&2; exit 1; }
test "$(systemctl show bitcoinwalk-guide.service -p User --value)" = bitcoinwalk-guide || { echo 'Unexpected Guide service user; refusing to change shared-state ownership.' >&2; exit 1; }
if systemctl is-active --quiet "$unit"; then echo 'Test1 pilot is already active.' >&2; exit 1; fi
"$node" "$release/check-guide-private-pilot.cjs"
"$node" "$release/prepare-guide-test1-pilot.cjs" --preflight "$release/knowledge.json"
target="/opt/bitcoinwalk-guide-private-pilot/$(basename "$release")"
if test -e "$target"; then
 test -d "$target" && test ! -L "$target" && test "$(stat -c %u "$target")" = 0 || { echo 'Unsafe existing pilot directory.' >&2; exit 1; }
 for file in run-guide-private-pilot.cjs prepare-guide-test1-pilot.cjs stop-guide-test1-pilot.sh knowledge.json; do
  test -f "$target/$file" && test ! -L "$target/$file" && cmp -s "$release/$file" "$target/$file" || { echo 'Existing pilot code differs; refusing replacement.' >&2; exit 1; }
 done
else
 install -d -o root -g root -m 0755 "$target"
 for file in run-guide-private-pilot.cjs prepare-guide-test1-pilot.cjs stop-guide-test1-pilot.sh; do install -o root -g root -m 0755 "$release/$file" "$target/$file"; done
 install -o root -g root -m 0644 "$release/knowledge.json" "$target/knowledge.json"
fi
credential_dir=$(mktemp -d /run/bitcoinwalk-guide-private-pilot-key.XXXXXX)
policy_created=false
cleanup(){
 status=$?
 rm -f "$credential_dir/openai-key"
 rmdir "$credential_dir"
 if test "$status" -ne 0 && test "$policy_created" = true; then bash "$target/stop-guide-test1-pilot.sh" || true; fi
}
trap cleanup EXIT
read -rsp 'OpenAI API key (temporary one-hour Test1 pilot): ' guide_api_key
echo
test -n "$guide_api_key" || { echo 'Empty API key; pilot not started.' >&2; exit 1; }
printf '%s\n' "$guide_api_key" > "$credential_dir/openai-key"
unset guide_api_key
"$node" "$target/prepare-guide-test1-pilot.cjs" --activate "$target/knowledge.json"
policy_created=true
systemd-run --unit=bitcoinwalk-guide-test1-pilot --collect \
 -p Type=exec \
 -p User=bitcoinwalk-guide -p DynamicUser=yes \
 -p StateDirectory=bitcoinwalk-guide -p StateDirectoryMode=0700 \
 -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
 -p "LoadCredential=openai-key:$credential_dir/openai-key" \
 -p Environment=GUIDE_CONFIG=/etc/bitcoinwalk-guide/config.json \
 -p "Environment=GUIDE_KNOWLEDGE=$target/knowledge.json" \
 -p "Environment=GUIDE_PRIVATE_PILOT_POLICY=$policy" \
 -p RuntimeMaxSec=3600 -p Restart=no -p TimeoutStopSec=15 \
 -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=yes \
 -p PrivateTmp=yes -p PrivateDevices=yes -p UMask=0077 \
 -p MemoryMax=256M -p TasksMax=64 -p LimitCORE=0 \
 "$node" "$target/run-guide-private-pilot.cjs" --watch
sleep 3
systemctl is-active --quiet "$unit" || { echo 'Pilot failed to start; disabling its policy.' >&2; exit 1; }
echo 'One-hour Test1-only pilot started. Source API-key file is removed on exit; systemd holds the temporary credential until stop.'
echo 'Maximum 10 model attempts and 5 admitted replies; Basic allowance still applies. Only new exact evaluated FAQ questions are admitted.'
echo "Stop immediately with: sudo bash $target/stop-guide-test1-pilot.sh"
systemctl status "$unit" --no-pager -n 8
