#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
artifact=bitcoinwalk-guide-profile-0.3.405.cjs
target=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
state=/var/lib/bitcoinwalk-guide
unit=/etc/systemd/system/bitcoinwalk-guide.service
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
artifact_hash=c58dfaea95c441972bd03d3406ccd5d81c1f1ea0e146e68355aa232f22567920
guide_pubkey=9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c
avatar_hash=71abbfebbdc278777f04ee940f06a325af278e39c047072f20394891c405c741

test "$(id -u)" -eq 0
test "$(sha256sum "$artifact" | cut -d' ' -f1)" = "$artifact_hash"
test "$(sha256sum "$target" | cut -d' ' -f1)" = 0606719d763b819eeb8356ae335b1eccc3d1e4b3a2eafab88808d3a72cd08591
test "$(sha256sum "$config" | cut -d' ' -f1)" = 3c02c4a926384f840464a6e1881b22ac0785f037d683519140bedb95c66f403f
test "$(sha256sum "$unit" | cut -d' ' -f1)" = 4525f663b348437c3230dc274fd6f975d76dd6fde2ba1295bc6a84a529583719
test "$(curl -fsS --max-time 10 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.404"}'
curl -fsS --max-time 15 'https://bitcoinwalk.org/.well-known/nostr.json?name=guide' | grep -Fq '"guide":"'"$guide_pubkey"'"'
test "$(curl -fsS --max-time 15 https://bitcoinwalk.org/brand/bitcoinwalk-admin-favicon.png | sha256sum | cut -d' ' -f1)" = "$avatar_hash"

# Exercise public reads and inbox policy without loading the signing key.
GUIDE_CONFIG="$config" "$node" "$artifact" --dry-run

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-profile-0.3.405.XXXXXX)
chmod 0700 "$backup"
cp -p "$target" "$backup/guide.cjs.before"
published=false

run_profile_mode() {
  transient_unit=$1
  mode=$2
  systemd-run --unit="$transient_unit" --wait --pipe --collect \
    -p DynamicUser=yes -p StateDirectory=bitcoinwalk-guide -p StateDirectoryMode=0700 \
    -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
    -p Environment=GUIDE_CONFIG=/etc/bitcoinwalk-guide/config.json \
    "$node" "$target" "$mode"
}

rollback() {
  install -o root -g root -m 0644 "$backup/guide.cjs.before" "$target"
  systemctl reset-failed bitcoinwalk-guide.service >/dev/null 2>&1 || true
  systemctl restart bitcoinwalk-guide.service >/dev/null 2>&1 || true
  if "$published"; then
    run_profile_mode bitcoinwalk-guide-profile-rollback --publish-profile >/dev/null 2>&1 || true
  fi
  echo "Guide profile upgrade failed; previous worker restored. Backup: $backup" >&2
  exit 1
}
trap rollback INT TERM HUP EXIT

systemctl stop bitcoinwalk-guide.service
install -o root -g root -m 0644 "$artifact" "$target"
test "$(sha256sum "$target" | cut -d' ' -f1)" = "$artifact_hash"
systemctl reset-failed bitcoinwalk-guide.service
systemctl start bitcoinwalk-guide.service
systemctl is-active --quiet bitcoinwalk-guide.service

run_profile_mode bitcoinwalk-guide-profile-0-3-405 --publish-profile
published=true
run_profile_mode bitcoinwalk-guide-profile-check-0-3-405 --check-profile
systemctl is-active --quiet bitcoinwalk-guide.service

trap - INT TERM HUP EXIT
echo "BitcoinWalk Guide profile 0.3.405 accepted. Backup: $backup"
echo "Published name: BitcoinWalk Guide"
echo "Published avatar: https://bitcoinwalk.org/brand/bitcoinwalk-admin-favicon.png"
echo "Published NIP-05 and Lightning address: guide@bitcoinwalk.org"
