#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 && "$1" == *.tar.zst.gpg && "$2" =~ ^(worker|signer)$ ]]||{ echo "usage: $0 BACKUP.tar.zst.gpg worker|signer" >&2;exit 64; }
ciphertext="$(realpath "$1")";component="$2";work="$(mktemp -d)";archive="$work/archive.tar.zst";trap 'rm -rf -- "$work"' EXIT;chmod 700 "$work";gpg_bin="${BITCOINWALK_RESTORE_GPG:-gpg}";verify="${BITCOINWALK_RECEIPT_RESTORE_VERIFY:-$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)/verify-rustress-receipt-restore.cjs}"
"$gpg_bin" --output "$archive" --decrypt "$ciphertext";mapfile -t entries < <(tar --zstd -tf "$archive");mapfile -t types < <(tar --zstd -tvf "$archive"|awk '{print substr($1,1,1)}');expected=2;[[ "$component" == signer ]]&&expected=4;[[ "${#entries[@]}" -eq "$expected" && "${#types[@]}" -eq "$expected" ]]||exit 1
for type in "${types[@]}";do [[ "$type" == - ]]||exit 1;done
allowed='^(database.sqlite|manifest.txt)$';[[ "$component" == signer ]]&&allowed='^(database.sqlite|manifest.txt|provider-secret-key|provider-pubkey)$';for entry in "${entries[@]}";do [[ "$entry" =~ $allowed ]]||exit 1;done
tar --zstd --no-same-owner --no-same-permissions -xf "$archive" -C "$work";for entry in "${entries[@]}";do [[ -f "$work/$entry" && ! -L "$work/$entry" ]]||exit 1;done
node "$verify" "$component" "$work"|grep -qx "RECEIPT_RESTORE_MATERIAL_OK component=$component"
printf 'RECEIPT_RESTORE_REHEARSAL_OK component=%s decrypted_material_removed_on_exit=yes\n' "$component"
