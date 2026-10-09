#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)";root="$(cd "$here/../../.."&&pwd)"
bash -n "$here/backup-receipt-state.sh" "$here/verify-receipt-backup-restore.sh"
python3 -c 'import pathlib;compile(pathlib.Path(__import__("sys").argv[1]).read_text(),__import__("sys").argv[1],"exec")' "$root/integrations/rustress/payout-backup/prune-encrypted-backups.py"
[[ -f "$root/release-build/verify-rustress-receipt-restore.cjs" ]]||npm --prefix "$root" run rustress-receipt-service:build >/dev/null
work="$(mktemp -d)";trap 'rm -rf -- "$work"' EXIT;export GNUPGHOME="$work/gnupg";mkdir -m 700 "$GNUPGHOME";gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'BitcoinWalk Receipt Fixture' rsa2048 encr 1d >/dev/null 2>&1
fingerprint="$(gpg --batch --with-colons --list-keys|awk -F: '$1=="fpr"{print $10;exit}')";export BITCOINWALK_RECEIPT_RESTORE_VERIFY="$root/release-build/verify-rustress-receipt-restore.cjs"
for component in worker signer;do
 material="$work/$component";mkdir "$material";node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.argv[1]);d.exec("CREATE TABLE fixture(value TEXT)");d.prepare("INSERT INTO fixture VALUES (?)").run("safe");d.close()' "$material/database.sqlite"
 printf 'component=receipt-%s\ncreated=20261009T120000Z\ndatabase_sha256=%s\n' "$component" "$(sha256sum "$material/database.sqlite"|cut -d' ' -f1)">"$material/manifest.txt"
 if [[ "$component" == signer ]];then { printf '03%.0s' $(seq 1 32);printf '\n';}>"$material/provider-secret-key";printf '%s\n' 531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337>"$material/provider-pubkey";printf 'provider_secret_sha256=%s\nprovider_pubkey_sha256=%s\n' "$(sha256sum "$material/provider-secret-key"|cut -d' ' -f1)" "$(sha256sum "$material/provider-pubkey"|cut -d' ' -f1)">>"$material/manifest.txt";fi
 if [[ "$component" == signer ]];then node "$BITCOINWALK_RECEIPT_RESTORE_VERIFY" pair "$material/provider-secret-key" "$material/provider-pubkey"|grep -qx RECEIPT_KEY_PAIR_OK;fi
 if [[ "$component" == signer ]];then files=(database.sqlite manifest.txt provider-secret-key provider-pubkey);else files=(database.sqlite manifest.txt);fi
 tar --zstd -C "$material" -cf - "${files[@]}"|gpg --batch --trust-model always --recipient "$fingerprint" --encrypt --output "$work/receipt-$component.tar.zst.gpg"
 if [[ "$component" == signer ]];then restore_args=(signer 531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337);else restore_args=(worker);fi
 "$here/verify-receipt-backup-restore.sh" "$work/receipt-$component.tar.zst.gpg" "${restore_args[@]}"|grep -q "^RECEIPT_RESTORE_REHEARSAL_OK component=$component decrypted_material_removed_on_exit=yes$"
 if [[ "$component" == signer ]];then
  if "$here/verify-receipt-backup-restore.sh" "$work/receipt-$component.tar.zst.gpg" signer 0000000000000000000000000000000000000000000000000000000000000000 >/dev/null 2>&1;then echo "Signer restore accepted the wrong provider identity" >&2;exit 1;fi
  if "$here/verify-receipt-backup-restore.sh" "$work/receipt-$component.tar.zst.gpg" signer >/dev/null 2>&1;then echo "Signer restore accepted no provider identity" >&2;exit 1;fi
 fi
done
oversized="$work/oversized";mkdir "$oversized";truncate -s 2097152 "$oversized/database.sqlite";printf 'component=receipt-worker\ncreated=20261009T120000Z\ndatabase_sha256=%s\n' "$(sha256sum "$oversized/database.sqlite"|cut -d' ' -f1)">"$oversized/manifest.txt";tar --zstd -C "$oversized" -cf - database.sqlite manifest.txt|gpg --batch --trust-model always --recipient "$fingerprint" --encrypt --output "$work/receipt-worker-oversized.tar.zst.gpg"
if BITCOINWALK_RECEIPT_RESTORE_MAX_EXPANDED_BYTES=1048576 "$here/verify-receipt-backup-restore.sh" "$work/receipt-worker-oversized.tar.zst.gpg" worker >/dev/null 2>&1;then echo "Restore accepted an archive above its expanded-size limit" >&2;exit 1;fi
tar --sparse --zstd -C "$oversized" -cf - database.sqlite manifest.txt|gpg --batch --trust-model always --recipient "$fingerprint" --encrypt --output "$work/receipt-worker-sparse.tar.zst.gpg"
if BITCOINWALK_RECEIPT_RESTORE_MAX_EXPANDED_BYTES=1048576 "$here/verify-receipt-backup-restore.sh" "$work/receipt-worker-sparse.tar.zst.gpg" worker >/dev/null 2>&1;then echo "Restore accepted sparse members above the expanded-size limit" >&2;exit 1;fi
export BITCOINWALK_PAYOUT_BACKUP_DIR="$work/receiver";for component in worker signer;do name="receipt-$component-20261009T120000Z-v1.tar.zst.gpg";receipt="$(printf encrypted-fixture|SSH_ORIGINAL_COMMAND="upload $name" "$root/integrations/rustress/payout-backup/receive-encrypted-backup.sh")";[[ "$receipt" == stored\ "$name"\ * ]];done
export BITCOINWALK_PAYOUT_BACKUP_DIR="$work/prune";mkdir -p "$BITCOINWALK_PAYOUT_BACKUP_DIR";for component in worker signer;do for offset in $(seq 2 70);do stamp="$(date -u -d "$offset days ago" +%Y%m%dT120000Z)";touch "$BITCOINWALK_PAYOUT_BACKUP_DIR/receipt-$component-$stamp-v1.tar.zst.gpg" "$BITCOINWALK_PAYOUT_BACKUP_DIR/receipt-$component-$stamp-v1.tar.zst.gpg.sha256";done;done
before="$(find "$BITCOINWALK_PAYOUT_BACKUP_DIR" -name '*.tar.zst.gpg'|wc -l)";python3 "$root/integrations/rustress/payout-backup/prune-encrypted-backups.py";after="$(find "$BITCOINWALK_PAYOUT_BACKUP_DIR" -name '*.tar.zst.gpg'|wc -l)";[[ "$after" -lt "$before" && "$after" -ge 28 ]]
printf 'Receipt backup package checks passed (%s retained from %s fixtures).\n' "$after" "$before"
