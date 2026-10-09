#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")"&&pwd)";for script in "$here"/*.sh;do bash -n "$script";done
python3 -c 'import pathlib;compile(pathlib.Path(__import__("sys").argv[1]).read_text(),__import__("sys").argv[1],"exec")' "$here/prune-encrypted-backups.py"
work="$(mktemp -d)";trap 'rm -rf -- "$work"' EXIT;export BITCOINWALK_PAYOUT_BACKUP_DIR="$work/archives"
for component in ledger journal;do name="payout-$component-20261009T120000Z-v1.tar.zst.gpg";receipt="$(printf encrypted-fixture|SSH_ORIGINAL_COMMAND="upload $name" "$here/receive-encrypted-backup.sh")";sha="$(sha256sum "$BITCOINWALK_PAYOUT_BACKUP_DIR/$name"|cut -d' ' -f1)";size="$(stat -c '%s' "$BITCOINWALK_PAYOUT_BACKUP_DIR/$name")";[[ "$receipt" == "stored $name $sha $size" ]];done
set +e;printf duplicate|SSH_ORIGINAL_COMMAND='upload payout-ledger-20261009T120000Z-v1.tar.zst.gpg' "$here/receive-encrypted-backup.sh" >/dev/null 2>&1;status=$?;set -e;[[ "$status" -eq 73 ]]
[[ "$(SSH_ORIGINAL_COMMAND=probe "$here/receive-encrypted-backup.sh")" == bitcoinwalk-payout-backup-receiver-ready ]]
for component in ledger journal;do for offset in $(seq 2 70);do stamp="$(date -u -d "$offset days ago" +%Y%m%dT120000Z)";touch "$BITCOINWALK_PAYOUT_BACKUP_DIR/payout-$component-$stamp-v1.tar.zst.gpg" "$BITCOINWALK_PAYOUT_BACKUP_DIR/payout-$component-$stamp-v1.tar.zst.gpg.sha256";done;done
before="$(find "$BITCOINWALK_PAYOUT_BACKUP_DIR" -name '*.tar.zst.gpg'|wc -l)";python3 "$here/prune-encrypted-backups.py";after="$(find "$BITCOINWALK_PAYOUT_BACKUP_DIR" -name '*.tar.zst.gpg'|wc -l)";[[ "$after" -lt "$before" && "$after" -ge 28 ]]
export GNUPGHOME="$work/gnupg";mkdir -m 700 "$GNUPGHOME";gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'BitcoinWalk Payout Fixture' rsa2048 encr 1d >/dev/null 2>&1
restore="$work/restore";mkdir "$restore";node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.argv[1]);d.exec("CREATE TABLE fixture(value TEXT)");d.prepare("INSERT INTO fixture VALUES (?)").run("safe");d.close()' "$restore/database.sqlite"
printf 'component=ledger\ncreated=20261009T120000Z\ndatabase_sha256=%s\n' "$(sha256sum "$restore/database.sqlite"|cut -d' ' -f1)" > "$restore/manifest.txt"
fingerprint="$(gpg --batch --with-colons --list-keys|awk -F: '$1=="fpr"{print $10;exit}')";tar --zstd -C "$restore" -cf - database.sqlite manifest.txt|gpg --batch --trust-model always --recipient "$fingerprint" --encrypt --output "$work/restore.tar.zst.gpg"
"$here/verify-payout-backup-restore.sh" "$work/restore.tar.zst.gpg" ledger | grep -q '^PAYOUT_RESTORE_REHEARSAL_OK'
printf 'Payout backup package checks passed (%s retained from %s fixtures).\n' "$after" "$before"
