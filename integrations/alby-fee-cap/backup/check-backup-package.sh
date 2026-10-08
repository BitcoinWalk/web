#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for script in "$here"/*.sh; do bash -n "$script"; done
python3 -c 'import pathlib; compile(pathlib.Path(__import__("sys").argv[1]).read_text(), __import__("sys").argv[1], "exec")' "$here/prune-encrypted-backups.py"

work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
export BITCOINWALK_HUB_BACKUP_DIR="$work/archives"
name="hub-feecap-20261009T120000Z-6bb8520025d7.tar.zst.gpg"
receipt="$(printf 'encrypted-fixture' | SSH_ORIGINAL_COMMAND="upload $name" "$here/receive-encrypted-backup.sh")"
sha256="$(sha256sum "$BITCOINWALK_HUB_BACKUP_DIR/$name" | cut -d' ' -f1)"
size="$(stat -c '%s' "$BITCOINWALK_HUB_BACKUP_DIR/$name")"
[[ "$receipt" == "stored $name $sha256 $size" ]]
(cd "$BITCOINWALK_HUB_BACKUP_DIR" && sha256sum -c "$name.sha256")

set +e
printf duplicate | SSH_ORIGINAL_COMMAND="upload $name" "$here/receive-encrypted-backup.sh" >/dev/null 2>&1
duplicate_status=$?
set -e
[[ "$duplicate_status" -eq 73 ]]
[[ "$(SSH_ORIGINAL_COMMAND=probe "$here/receive-encrypted-backup.sh")" == "bitcoinwalk-hub-backup-receiver-ready" ]]

for offset in $(seq 2 70); do
  stamp="$(date -u -d "$offset days ago" +%Y%m%dT120000Z)"
  file="$BITCOINWALK_HUB_BACKUP_DIR/hub-feecap-$stamp-6bb8520025d7.tar.zst.gpg"
  : > "$file"
  : > "$file.sha256"
done
before="$(find "$BITCOINWALK_HUB_BACKUP_DIR" -maxdepth 1 -type f -name '*.tar.zst.gpg' | wc -l)"
python3 "$here/prune-encrypted-backups.py"
after="$(find "$BITCOINWALK_HUB_BACKUP_DIR" -maxdepth 1 -type f -name '*.tar.zst.gpg' | wc -l)"
[[ "$after" -lt "$before" && "$after" -ge 14 ]]
[[ -f "$BITCOINWALK_HUB_BACKUP_DIR/$name" ]]
orphan_count="$(find "$BITCOINWALK_HUB_BACKUP_DIR" -maxdepth 1 -type f -name '*.sha256' | while read -r checksum; do [[ -f "${checksum%.sha256}" ]] || printf 'orphan\n'; done | wc -l)"
[[ "$orphan_count" -eq 0 ]]

printf 'Hub backup package checks passed (%s retained from %s fixture archives).\n' "$after" "$before"
