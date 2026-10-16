#!/usr/bin/env bash
set -euo pipefail
umask 077

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
receiver="/home/bitcoinwalk/.local/libexec/bitcoinwalk-hub-backup-receive"
pruner="/home/bitcoinwalk/.local/libexec/bitcoinwalk-hub-backup-prune"

[[ "$(id -u)" != "0" && "$(id -un)" == "bitcoinwalk" ]] || {
  echo "Install as the non-root bitcoinwalk account." >&2
  exit 77
}
[[ -f "$receiver" && -O "$receiver" && ! -L "$receiver" ]] || { echo "Existing receiver boundary is unsafe." >&2; exit 73; }
[[ -f "$pruner" && -O "$pruner" && ! -L "$pruner" ]] || { echo "Existing pruner boundary is unsafe." >&2; exit 73; }

(cd -- "$here" && sha256sum -c SHA256SUMS)
"$here/check-backup-package.sh"
[[ "$(SSH_ORIGINAL_COMMAND=probe "$receiver")" == "bitcoinwalk-hub-backup-receiver-ready" ]] || exit 69

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/home/bitcoinwalk/backups/hub-backup-receiver-live-$stamp"
mkdir -p -m 700 -- "$backup"
cp -p -- "$receiver" "$backup/bitcoinwalk-hub-backup-receive.before"
cp -p -- "$pruner" "$backup/bitcoinwalk-hub-backup-prune.before"

install -m 700 "$here/receive-encrypted-backup.sh" "$receiver.new"
install -m 700 "$here/prune-encrypted-backups.py" "$pruner.new"
mv -f -- "$receiver.new" "$receiver"
mv -f -- "$pruner.new" "$pruner"

[[ "$(SSH_ORIGINAL_COMMAND=probe "$receiver")" == "bitcoinwalk-hub-backup-receiver-ready" ]] || {
  cp -p -- "$backup/bitcoinwalk-hub-backup-receive.before" "$receiver"
  cp -p -- "$backup/bitcoinwalk-hub-backup-prune.before" "$pruner"
  echo "Receiver probe failed; predecessor restored." >&2
  exit 70
}
XDG_RUNTIME_DIR="/run/user/$(id -u)" systemctl --user is-enabled bitcoinwalk-hub-backup-prune.timer >/dev/null
XDG_RUNTIME_DIR="/run/user/$(id -u)" systemctl --user is-active bitcoinwalk-hub-backup-prune.timer >/dev/null

printf 'Live Hub encrypted-backup namespace accepted. Backup: %s\n' "$backup"
printf '%s\n' "Candidate and production restore points retain independently; no existing archive was modified by installation."

