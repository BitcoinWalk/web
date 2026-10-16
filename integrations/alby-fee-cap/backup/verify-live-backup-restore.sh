#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "$(id -u)" != "0" ]] || { echo "Run as your normal trusted-workstation user, never root." >&2; exit 77; }
[[ $# -eq 1 && -f "$1" && "$1" == hub-live-*.tar.zst.gpg ]] || {
  echo "usage: $0 hub-live-YYYYMMDDTHHMMSSZ-LIVEIMAGE-CANDIDATE.tar.zst.gpg" >&2
  exit 64
}
for required in gpg sqlite3 tar; do
  command -v "$required" >/dev/null 2>&1 || { echo "$required is required." >&2; exit 69; }
done

ciphertext="$(readlink -f -- "$1")"
work="$(mktemp -d "${TMPDIR:-/tmp}/bitcoinwalk-hub-live-restore.XXXXXX")"
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
    echo "Unsafe archive path refused." >&2
    exit 65
  }
  case "$path" in
    state|state/*|manifest.txt) ;;
    *) echo "Unexpected archive path refused." >&2; exit 65 ;;
  esac
done < "$listing"
if ! awk 'substr($1,1,1) == "-" || substr($1,1,1) == "d" {next} {exit 1}' "$details"; then
  echo "Archive links or special files refused." >&2
  exit 65
fi

tar --zstd --extract --file "$archive" --directory "$restored" --no-same-owner --no-same-permissions
for required in manifest.txt state/albyhub/nwc.db; do
  [[ -f "$restored/$required" && ! -L "$restored/$required" ]] || { echo "Required restore item missing: $required" >&2; exit 66; }
done
[[ -z "$(find "$restored" -type l -print -quit)" ]] || { echo "Restored links refused." >&2; exit 66; }
grep -Fxq 'format=bitcoinwalk-live-hub-backup-v1' "$restored/manifest.txt" || { echo "Live-backup manifest marker missing." >&2; exit 66; }
grep -Eq '^live_image=sha256:[0-9a-f]{64}$' "$restored/manifest.txt" || exit 66
grep -Eq '^candidate_revision=[0-9a-f]{64}$' "$restored/manifest.txt" || exit 66
[[ "$(sqlite3 -readonly "$restored/state/albyhub/nwc.db" 'PRAGMA integrity_check;')" == "ok" ]] || { echo "SQLite integrity check failed." >&2; exit 67; }
apps="$(sqlite3 -readonly "$restored/state/albyhub/nwc.db" 'SELECT COUNT(*) FROM apps;')"
permissions="$(sqlite3 -readonly "$restored/state/albyhub/nwc.db" 'SELECT COUNT(*) FROM app_permissions;')"
if [[ -n "$(find "$restored/state" -type f -name '*.recovery' -print -quit)" ]]; then recovery=yes; else recovery=no; fi
files="$(find "$restored" -type f | wc -l)"
printf 'LIVE_RESTORE_REHEARSAL_OK files=%s apps=%s permissions=%s recovery_artifact_present=%s decrypted_material_removed_on_exit=yes\n' \
  "$files" "$apps" "$permissions" "$recovery"

