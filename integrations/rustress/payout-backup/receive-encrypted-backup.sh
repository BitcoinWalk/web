#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir="${BITCOINWALK_PAYOUT_BACKUP_DIR:-/home/bitcoinwalk/offhost-payout-backups/archives}"
command_text="${SSH_ORIGINAL_COMMAND:-}"
if [[ "$command_text" == probe ]]; then printf '%s\n' bitcoinwalk-payout-backup-receiver-ready; exit 0; fi
if [[ ! "$command_text" =~ ^upload\ (payout-(ledger|journal)-[0-9]{8}T[0-9]{6}Z-v[0-9]+\.tar\.zst\.gpg)$ ]]; then echo "Unsupported payout backup receiver command" >&2; exit 64; fi
name="${BASH_REMATCH[1]}";mkdir -p -m 700 -- "$backup_dir"
[[ ! -L "$backup_dir" && -O "$backup_dir" ]] || { echo "Unsafe payout backup directory" >&2; exit 73; }
[[ "$(du -sb "$backup_dir" | cut -f1)" -le 2147483648 ]] || { echo "Payout backup storage ceiling reached" >&2; exit 75; }
target="$backup_dir/$name";lock="$target.lock"
mkdir -m 700 -- "$lock" 2>/dev/null || { echo "Payout backup already in progress" >&2; exit 73; }
temporary="$(mktemp "$backup_dir/.upload.XXXXXX")";trap 'rm -f -- "$temporary"; rmdir -- "$lock" 2>/dev/null || true' EXIT
[[ ! -e "$target" && ! -e "$target.sha256" ]] || { echo "Payout backup already exists" >&2; exit 73; }
ulimit -f 131072;cat > "$temporary";size="$(stat -c '%s' "$temporary")"
[[ "$size" -gt 0 && "$size" -le 134217728 ]] || { echo "Payout backup is empty or too large" >&2; exit 65; }
sha256="$(sha256sum "$temporary" | cut -d' ' -f1)";chmod 600 "$temporary";mv -n -- "$temporary" "$target"
printf '%s  %s\n' "$sha256" "$name" > "$target.sha256";chmod 600 "$target.sha256";sync -f "$backup_dir";rmdir -- "$lock";trap - EXIT
printf 'stored %s %s %s\n' "$name" "$sha256" "$size"
