#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ ${EUID} -ne 0 ]]; then
  echo 'Run this helper with sudo from your server administrator account.' >&2
  exit 1
fi
case "${1:-preview}" in
  preview) mode=--preview ;;
  send) mode=--send ;;
  *) echo 'Usage: run-hannover-guide-once.sh [preview|send]' >&2; exit 1 ;;
esac
if [[ $# -gt 1 ]]; then exit 1; fi
exec 9>/run/lock/bitcoinwalk-guide-hannover-once.lock
flock -n 9 || { echo 'Another Hannover delivery operation is running.' >&2; exit 1; }
source_bundle=/home/bitcoinwalk/incoming/send-hannover-guide.cjs
expected=6f4c06233a38734dda1e59e86e4ce69d7eb4c78e054467a46bbd06246aef2339
# Copy into root-owned storage before checking and executing the immutable bytes.
delivery_dir=$(mktemp -d /opt/bitcoinwalk-guide-hannover.XXXXXXXX)
chmod 0755 "$delivery_dir"
install -o root -g root -m 0644 "$source_bundle" "$delivery_dir/send.cjs"
printf '%s  %s\n' "$expected" "$delivery_dir/send.cjs" | sha256sum --check --status
systemd-run --quiet --wait --pipe --collect \
  --unit=bitcoinwalk-guide-hannover-once \
  --property=Type=exec \
  --property=DynamicUser=yes \
  --property=StateDirectory=bitcoinwalk-guide-hannover-once \
  --property=StateDirectoryMode=0700 \
  --property=LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
  --property=UMask=0077 \
  --property=NoNewPrivileges=yes \
  --property=ProtectSystem=strict \
  --property=ProtectHome=yes \
  --property=PrivateTmp=yes \
  --property=PrivateDevices=yes \
  --property=ProtectKernelTunables=yes \
  --property=ProtectKernelModules=yes \
  --property=ProtectControlGroups=yes \
  --property=RestrictSUIDSGID=yes \
  --property='RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
  --property=CapabilityBoundingSet= \
  --property=LimitCORE=0 \
  --property=RuntimeMaxSec=90 \
  /opt/bitcoinwalk-app-staging/runtime/bin/node "$delivery_dir/send.cjs" "$mode"
echo 'Completed. Guide itself was not restarted or modified.'
