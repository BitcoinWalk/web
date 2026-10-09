#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 && "$1" == *.tar.zst.gpg && "$2" =~ ^(ledger|journal)$ ]] || { echo "usage: $0 BACKUP.tar.zst.gpg ledger|journal" >&2;exit 64; }
ciphertext="$(realpath "$1")";component="$2";work="$(mktemp -d)";archive="$work/archive.tar.zst";trap 'rm -rf -- "$work"' EXIT;chmod 700 "$work"
gpg_bin="${BITCOINWALK_RESTORE_GPG:-gpg}";"$gpg_bin" --output "$archive" --decrypt "$ciphertext"
mapfile -t entries < <(tar --zstd -tf "$archive");[[ "${#entries[@]}" -eq 2 ]] || exit 1
for entry in "${entries[@]}";do [[ "$entry" == database.sqlite || "$entry" == manifest.txt ]] || exit 1;done
tar --zstd --no-same-owner --no-same-permissions -xf "$archive" -C "$work";[[ -f "$work/database.sqlite" && ! -L "$work/database.sqlite" && -f "$work/manifest.txt" && ! -L "$work/manifest.txt" ]] || exit 1
grep -qx "component=$component" "$work/manifest.txt";expected="$(awk -F= '$1=="database_sha256"{print $2}' "$work/manifest.txt")";[[ "$expected" =~ ^[0-9a-f]{64}$ && "$expected" == "$(sha256sum "$work/database.sqlite"|cut -d' ' -f1)" ]] || exit 1
node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.argv[1],{readOnly:true});const r=d.prepare("PRAGMA integrity_check").get();d.close();if(Object.values(r)[0]!=="ok")process.exit(1)' "$work/database.sqlite"
printf 'PAYOUT_RESTORE_REHEARSAL_OK component=%s decrypted_material_removed_on_exit=yes\n' "$component"
