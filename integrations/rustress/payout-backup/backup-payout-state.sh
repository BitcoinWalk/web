#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 && "$1" =~ ^(ledger|journal)$ ]] || { echo "Expected ledger or journal" >&2; exit 64; }
component="$1";config="${BITCOINWALK_PAYOUT_BACKUP_CONFIG:-/home/bitcoinwalk/.config/bitcoinwalk-payout-backup-$component}"
spool="${BITCOINWALK_PAYOUT_BACKUP_SPOOL:-/home/bitcoinwalk/.local/state/bitcoinwalk-payout-backup-$component}"
recipient="$config/recipient-public.asc";ssh_config="$config/ssh_config";gpg_bin="${BITCOINWALK_PAYOUT_GPG:-gpg}";mkdir -p -m 700 -- "$spool"
[[ "$(id -u)" != 0 && -f "$recipient" && ! -L "$recipient" && -f "$ssh_config" && ! -L "$ssh_config" ]] || { echo "Payout backup configuration unavailable" >&2; exit 1; }
work="$(mktemp -d)";gnupg="$(mktemp -d)";trap 'rm -rf -- "$work" "$gnupg"' EXIT;chmod 700 "$work" "$gnupg"
if "$gpg_bin" --batch --homedir "$gnupg" --import-options show-only --with-colons --import "$recipient" | grep -q '^sec:';then echo "Private backup keys are forbidden" >&2;exit 1;fi
"$gpg_bin" --batch --quiet --homedir "$gnupg" --import "$recipient";fingerprint="$("$gpg_bin" --batch --homedir "$gnupg" --with-colons --list-keys | awk -F: '$1=="fpr"{print $10;exit}')"
[[ "$("$gpg_bin" --batch --homedir "$gnupg" --with-colons --list-keys | awk -F: '$1=="pub"{n++}END{print n+0}')" -eq 1 && "$fingerprint" =~ ^[0-9A-Fa-f]{40}$ ]] || exit 1
if [[ "$component" == ledger ]];then
 source_db="/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/payout-service/ledger.sqlite"
 managed="/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/payout-service/managed-backup.sqlite"
 [[ -f "$managed" && ! -L "$managed" && $(( $(date -u +%s)-$(stat -c '%Y' "$managed") )) -le 28800 ]] || exit 1
 cp --reflink=auto -- "$managed" "$work/database.sqlite"
else
 source_db="/home/bitcoinwalk/journal-production-0.1.0/state/journal.sqlite"
 /opt/bitcoinwalk-app-staging/runtime/bin/node /home/bitcoinwalk/.local/libexec/bitcoinwalk-payout-backup/backup-sqlite-online.mjs "$source_db" "$work/database.sqlite"
fi
[[ -f "$source_db" && -f "$work/database.sqlite" ]] || exit 1
timestamp="$(date -u +%Y%m%dT%H%M%SZ)";name="payout-$component-$timestamp-v1.tar.zst.gpg";archive="$spool/$name"
printf 'component=%s\ncreated=%s\ndatabase_sha256=%s\n' "$component" "$timestamp" "$(sha256sum "$work/database.sqlite"|cut -d' ' -f1)" > "$work/manifest.txt"
tar --zstd --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$work" -cf - database.sqlite manifest.txt | "$gpg_bin" --batch --quiet --homedir "$gnupg" --trust-model always --recipient "$fingerprint" --encrypt --output "$archive"
chmod 600 "$archive";sha="$(sha256sum "$archive"|cut -d' ' -f1)";size="$(stat -c '%s' "$archive")";receipt="$(ssh -F "$ssh_config" payout-backup-receiver "upload $name" < "$archive")"
[[ "$receipt" == "stored $name $sha $size" ]] || { echo "Payout backup receipt mismatch" >&2;exit 1; }
printf '%s %s %s\n' "$timestamp" "$sha" "$size" > "$spool/last-success";chmod 600 "$spool/last-success";find "$spool" -maxdepth 1 -type f -name 'payout-*.tar.zst.gpg' -mtime +2 -delete
printf 'Encrypted %s backup stored and verified: %s\n' "$component" "$name"
