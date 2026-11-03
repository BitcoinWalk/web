#!/bin/sh
set -eu

test "$(id -u)" -eq 0 || { echo "Run as root." >&2; exit 1; }
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
worker=/opt/bitcoinwalk-guide/guide.cjs
config=/etc/bitcoinwalk-guide/config.json
candidate=/etc/bitcoinwalk-guide/config.bw67-candidate.json
unit=bitcoinwalk-guide.service
expected_worker=a78cc3370453ec8e400e7aa745f0ec9ae79e5f57f61d60c11fc082dbe28b1622

test -f "$worker" && test ! -L "$worker" || { echo "Guide worker is missing or unsafe." >&2; exit 1; }
test -f "$config" && test ! -L "$config" || { echo "Guide configuration is missing or unsafe." >&2; exit 1; }
test "$(sha256sum "$worker" | awk '{print $1}')" = "$expected_worker" || { echo "Unexpected Guide worker; refusing activation." >&2; exit 1; }
systemctl is-active --quiet "$unit" || { echo "Guide service is not active." >&2; exit 1; }

backup=$(mktemp -d /var/backups/bitcoinwalk-guide-bw67-enable.XXXXXX)
cp -a "$config" "$backup/config.json"
"$node" -e '
const fs=require("node:fs"),source=process.argv[1],target=process.argv[2];
const base=JSON.parse(fs.readFileSync(source,"utf8"));
if(Object.hasOwn(base,"support"))throw new Error("Support configuration already exists; review manually.");
const inboxRelays=["wss://auth.nostr1.com/","wss://nip17.unsaltedbutter.ai/","wss://inbox.stservices.io/"];
const next={...base,allowedInboxRelays:[...new Set([...base.allowedInboxRelays,...inboxRelays])],support:{enabled:true,inboxRelays,retentionDays:30}};
fs.writeFileSync(target,JSON.stringify(next,null,2)+"\n",{mode:0o644});
' "$config" "$candidate"
chown root:root "$candidate"
chmod 0644 "$candidate"

systemd-run --quiet --unit=bitcoinwalk-guide-bw67-enable-preflight --wait --pipe --collect \
  -p DynamicUser=yes \
  -p StateDirectory=bitcoinwalk-guide-bw67-enable-preflight \
  -p StateDirectoryMode=0700 \
  -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
  -p Environment=GUIDE_CONFIG="$candidate" \
  "$node" "$worker" --check-support-relays

rollback(){
  install -o root -g root -m 0644 "$backup/config.json" "$config"
  systemctl restart "$unit" || true
}
trap rollback HUP INT TERM
install -o root -g root -m 0644 "$candidate" "$config"
if ! systemctl restart "$unit" || ! systemctl is-active --quiet "$unit"; then
  rollback
  echo "Guide support activation failed before publication; previous configuration restored." >&2
  exit 1
fi
sleep 2
systemctl is-active --quiet "$unit" || { rollback; echo "Guide stopped before publication; previous configuration restored." >&2; exit 1; }

# From this point the signed announcement may become globally visible. Keep the
# enabled configuration if a later verification fails so the advertised inbox
# remains monitored and requires explicit operator review.
trap - HUP INT TERM
systemd-run --quiet --unit=bitcoinwalk-guide-bw67-publish-inbox --wait --pipe --collect \
  -p DynamicUser=yes \
  -p StateDirectory=bitcoinwalk-guide-bw67-publish-inbox \
  -p StateDirectoryMode=0700 \
  -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
  -p Environment=GUIDE_CONFIG="$config" \
  "$node" "$worker" --publish-support-inbox
systemd-run --quiet --unit=bitcoinwalk-guide-bw67-check-inbox --wait --pipe --collect \
  -p DynamicUser=yes \
  -p StateDirectory=bitcoinwalk-guide-bw67-check-inbox \
  -p StateDirectoryMode=0700 \
  -p LoadCredential=guide-key:/etc/bitcoinwalk-guide/guide-key \
  -p Environment=GUIDE_CONFIG="$config" \
  "$node" "$worker" --check-support-inbox

echo "Production Guide support intake enabled and signed inbox verified."
echo "Retention: 30 days. Automated replies and AI remain disabled."
echo "Backup: $backup"
systemctl status "$unit" --no-pager -n 10
