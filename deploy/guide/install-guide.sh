#!/bin/sh
set -eu
test "$(id -u)" = 0 || { echo 'Run this installer with sudo.'; exit 1; }
cd "$(dirname "$0")/.."
sha256sum -c SHA256SUMS
test -x /opt/bitcoinwalk-app-staging/runtime/bin/node
test ! -e /etc/systemd/system/bitcoinwalk-guide.service || { echo 'Guide already installed; stop for upgrade review.'; exit 1; }
test ! -e /etc/bitcoinwalk-guide
test ! -e /opt/bitcoinwalk-guide
install -d -m 0755 /opt/bitcoinwalk-guide /etc/bitcoinwalk-guide
install -m 0644 guide.cjs guide-key.cjs /opt/bitcoinwalk-guide/
install -m 0644 config.example.json /etc/bitcoinwalk-guide/config.json
/opt/bitcoinwalk-app-staging/runtime/bin/node /opt/bitcoinwalk-guide/guide-key.cjs /etc/bitcoinwalk-guide/guide-key
install -m 0644 deploy/bitcoinwalk-guide.service /etc/systemd/system/bitcoinwalk-guide.service
systemctl daemon-reload
echo 'Guide installed but DISABLED. No profile or DM published. No existing services changed.'
echo 'Next: review configuration, run dry-run, securely back up the key, publish the bot profile, then explicitly enable.'
