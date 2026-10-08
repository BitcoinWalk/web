#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir="${BITCOINWALK_HUB_BACKUP_DIR:-/home/bitcoinwalk/offhost-hub-backups/archives}"
command_text="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$command_text" == "probe" ]]; then
  printf '%s\n' "bitcoinwalk-hub-backup-receiver-ready"
  exit 0
fi

if [[ ! "$command_text" =~ ^upload\ (hub-feecap-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}\.tar\.zst\.gpg)$ ]]; then
  echo "Unsupported backup receiver command" >&2
  exit 64
fi

name="${BASH_REMATCH[1]}"
mkdir -p -m 700 -- "$backup_dir"
[[ ! -L "$backup_dir" && -O "$backup_dir" ]] || {
  echo "Backup directory is unsafe" >&2
  exit 73
}
existing_bytes="$(du -sb "$backup_dir" | cut -f1)"
[[ "$existing_bytes" -le 8589934592 ]] || {
  echo "Backup receiver storage ceiling reached" >&2
  exit 75
}
target="$backup_dir/$name"
lock="$target.lock"
if ! mkdir -m 700 -- "$lock" 2>/dev/null; then
  echo "Backup name is already in progress" >&2
  exit 73
fi
trap 'rmdir -- "$lock" 2>/dev/null || true' EXIT
[[ ! -e "$target" && ! -e "$target.sha256" ]] || {
  echo "Backup name already exists" >&2
  exit 73
}

temporary="$(mktemp "$backup_dir/.upload.XXXXXX")"
trap 'rm -f -- "$temporary"; rmdir -- "$lock" 2>/dev/null || true' EXIT
ulimit -f 2097152
cat > "$temporary"
size="$(stat -c '%s' "$temporary")"
[[ "$size" -gt 0 && "$size" -le 2147483648 ]] || {
  echo "Backup payload is empty or too large" >&2
  exit 65
}
sha256="$(sha256sum "$temporary" | cut -d' ' -f1)"
chmod 600 "$temporary"
mv -n -- "$temporary" "$target"
printf '%s  %s\n' "$sha256" "$name" > "$target.sha256"
chmod 600 "$target.sha256"
sync -f "$backup_dir"
rmdir -- "$lock"
trap - EXIT
printf 'stored %s %s %s\n' "$name" "$sha256" "$size"
