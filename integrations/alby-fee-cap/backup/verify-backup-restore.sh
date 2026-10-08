#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "$(id -u)" != "0" ]] || { echo "Run as your normal desktop user, never root" >&2; exit 1; }
[[ $# -eq 1 && -f "$1" && "$1" == *.tar.zst.gpg ]] || {
  echo "usage: $0 ENCRYPTED_BACKUP.tar.zst.gpg" >&2
  exit 64
}

ciphertext="$(readlink -f -- "$1")"
work="$(mktemp -d "${TMPDIR:-/tmp}/bitcoinwalk-hub-restore.XXXXXX")"
archive="$work/snapshot.tar.zst"
restored="$work/restored"
cleanup() {
  chmod -R u+rwX "$work" 2>/dev/null || true
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir -m 700 -- "$restored"

gpg --output "$archive" --decrypt "$ciphertext"
chmod 600 "$archive"

listing="$work/listing"
details="$work/details"
tar --zstd -tf "$archive" > "$listing"
tar --zstd -tvf "$archive" > "$details"
while IFS= read -r path; do
  [[ -n "$path" && "$path" != /* && "$path" != ".." && "$path" != ../* && "$path" != */../* && "$path" != */.. ]] || {
    echo "Unsafe archive path refused" >&2
    exit 65
  }
  case "$path" in
    state|state/*|image.id|container-manifest.json|manifest.txt) ;;
    *) echo "Unexpected archive path refused" >&2; exit 65 ;;
  esac
done < "$listing"

if awk 'substr($1,1,1) != "-" && substr($1,1,1) != "d" {exit 1}' "$details"; then
  :
else
  echo "Archive links or special files refused" >&2
  exit 65
fi

tar --zstd --extract --file "$archive" --directory "$restored" --no-same-owner --no-same-permissions
for required in \
  image.id \
  container-manifest.json \
  manifest.txt \
  state/.bitcoinwalk-no-spend-candidate \
  state/albyhub/nwc.db; do
  [[ -f "$restored/$required" && ! -L "$restored/$required" ]] || {
    echo "Required restore item missing: $required" >&2
    exit 66
  }
done
[[ -z "$(find "$restored" -type l -print -quit)" ]] || { echo "Restored links refused" >&2; exit 66; }
[[ -z "$(find "$restored" -name '*.recovery' -print -quit)" ]] || { echo "Unexpected recovery file present" >&2; exit 66; }
[[ "$(sqlite3 "$restored/state/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || {
  echo "SQLite integrity check failed" >&2
  exit 67
}
file_count="$(find "$restored" -type f | wc -l)"
printf 'RESTORE_REHEARSAL_OK files=%s decrypted_material_removed_on_exit=yes\n' "$file_count"
