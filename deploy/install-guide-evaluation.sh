#!/bin/bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run with sudo on 138.' >&2; exit 1; }
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
target=/opt/bitcoinwalk-guide/guide.cjs
test -f "$target" && test ! -L "$target"
current=$(sha256sum "$target" | cut -d' ' -f1)
next=$(sha256sum guide.cjs | cut -d' ' -f1)
if test "$current" != feca6d7281e3c5dd7736cb01a3aeaf24327af233a369dfa934cb30a7b5f20fe8 && test "$current" != "$next"; then
 echo 'Installed worker differs from the reviewed baseline; refusing replacement.' >&2; exit 1
fi
systemctl is-active --quiet bitcoinwalk-guide.service
backup=$(mktemp -d /var/backups/bitcoinwalk-guide-evaluation.XXXXXX)
cp -a "$target" "$backup/guide.cjs"
rollback(){ install -o root -g root -m 0755 "$backup/guide.cjs" "$target"; systemctl restart bitcoinwalk-guide.service; }
install -o root -g root -m 0755 guide.cjs "$target"
if ! systemctl restart bitcoinwalk-guide.service; then rollback; exit 1; fi
sleep 2
if ! systemctl is-active --quiet bitcoinwalk-guide.service; then rollback; exit 1; fi
install -o root -g root -m 0755 check-guide-ai-evaluation.cjs /opt/bitcoinwalk-guide/check-guide-ai-evaluation.cjs
echo "Plain-text drafting and isolated evaluator installed. No model call or reply sent. Backup: $backup"
