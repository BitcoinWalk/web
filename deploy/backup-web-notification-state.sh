#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 4 ]]||{ echo "usage: $0 DATABASE RECIPIENT_PUBLIC_KEY EXPECTED_FINGERPRINT OUTPUT.tar.gpg" >&2;exit 64; }
[[ "$(id -u)" -ne 0 ]]||{ echo "Run as the application owner, not root." >&2;exit 1; }
[[ -f "$1" && ! -L "$1" && -f "$2" && ! -L "$2" ]]||exit 1
database="$(realpath "$1")";recipient="$(realpath "$2")";expected="${3//[[:space:]]/}";output_dir="$(realpath "$(dirname "$4")")";output="$output_dir/$(basename "$4")"
[[ "$expected" =~ ^[0-9A-Fa-f]{40}$ && ! -e "$output" ]]||exit 1
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";node_bin="${BITCOINWALK_BACKUP_NODE:-node}";gpg_bin="${BITCOINWALK_BACKUP_GPG:-gpg}"
work="$(mktemp -d)";gnupg="$(mktemp -d)";temporary_dir="$(mktemp -d "$output_dir/.notification-backup.XXXXXX")";temporary="$temporary_dir/ciphertext";cleanup(){ rm -rf -- "$work" "$gnupg" "$temporary_dir"; };trap cleanup EXIT;chmod 700 "$work" "$gnupg"
if "$gpg_bin" --batch --homedir "$gnupg" --import-options show-only --with-colons --import "$recipient"|grep -q '^sec:';then echo "Private backup keys are forbidden." >&2;exit 1;fi
"$gpg_bin" --batch --quiet --homedir "$gnupg" --import "$recipient"
fingerprint="$("$gpg_bin" --batch --homedir "$gnupg" --with-colons --list-keys|awk -F: '$1=="fpr"{print $10;exit}')"
count="$("$gpg_bin" --batch --homedir "$gnupg" --with-colons --list-keys|awk -F: '$1=="pub"{n++}END{print n+0}')"
[[ "$count" -eq 1 && "${fingerprint^^}" == "${expected^^}" ]]||{ echo "Backup recipient does not match the reviewed fingerprint." >&2;exit 1; }
"$node_bin" "$root/deploy/backup-sqlite-online.mjs" "$database" "$work/database.sqlite"
"$node_bin" "$root/scripts/report-web-notification-state.mjs" "$work/database.sqlite" >"$work/notification-report.json"
(cd "$work"&&sha256sum database.sqlite notification-report.json >manifest.sha256)
tar --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$work" -cf - database.sqlite manifest.sha256 notification-report.json|"$gpg_bin" --batch --quiet --homedir "$gnupg" --trust-model always --recipient "$fingerprint" --encrypt --output "$temporary"
chmod 600 "$temporary";ln -- "$temporary" "$output";rm -- "$temporary";printf 'Encrypted notification-state backup created: %s\n' "$output"
