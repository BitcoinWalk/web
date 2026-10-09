#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 && "$1" =~ ^(worker|signer)$ ]]||{ echo "Expected worker or signer" >&2;exit 64; }
component="$1";root="${BITCOINWALK_RECEIPT_ROOT:-/home/bitcoinwalk/.local/state/bitcoinwalk-rustress/receipt-service}";config="${BITCOINWALK_RECEIPT_BACKUP_CONFIG:-/home/bitcoinwalk/.config/bitcoinwalk-receipt-backup-$component}";spool="${BITCOINWALK_RECEIPT_BACKUP_SPOOL:-/home/bitcoinwalk/.local/state/bitcoinwalk-receipt-backup-$component}"
recipient="$config/recipient-public.asc";ssh_config="$config/ssh_config";gpg_bin="${BITCOINWALK_RECEIPT_GPG:-gpg}";node_bin="${BITCOINWALK_RECEIPT_NODE:-node}";backup_js="${BITCOINWALK_RECEIPT_SQLITE_BACKUP:-/home/bitcoinwalk/.local/libexec/bitcoinwalk-receipt-backup/backup-sqlite-online.mjs}";pair_verify="${BITCOINWALK_RECEIPT_PAIR_VERIFY:-/home/bitcoinwalk/.local/libexec/bitcoinwalk-receipt-backup/verify-rustress-receipt-restore.cjs}";mkdir -p -m 700 -- "$spool"
[[ "$(id -u)" != 0 && -f "$recipient" && ! -L "$recipient" && -f "$ssh_config" && ! -L "$ssh_config" && -f "$backup_js" && ! -L "$backup_js" && -f "$pair_verify" && ! -L "$pair_verify" ]]||exit 1
work="$(mktemp -d)";gnupg="$(mktemp -d)";trap 'rm -rf -- "$work" "$gnupg"' EXIT;chmod 700 "$work" "$gnupg"
if "$gpg_bin" --batch --homedir "$gnupg" --import-options show-only --with-colons --import "$recipient"|grep -q '^sec:';then echo "Private backup keys are forbidden" >&2;exit 1;fi
"$gpg_bin" --batch --quiet --homedir "$gnupg" --import "$recipient";fingerprint="$("$gpg_bin" --batch --homedir "$gnupg" --with-colons --list-keys|awk -F: '$1=="fpr"{print $10;exit}')";[[ "$("$gpg_bin" --batch --homedir "$gnupg" --with-colons --list-keys|awk -F: '$1=="pub"{n++}END{print n+0}')" -eq 1 && "$fingerprint" =~ ^[0-9A-Fa-f]{40}$ ]]||exit 1
database="$root/$component/$( [[ "$component" == worker ]]&&printf authority||printf signer ).sqlite";[[ -f "$database" && ! -L "$database" ]]||exit 1;"$node_bin" "$backup_js" "$database" "$work/database.sqlite"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)";name="receipt-$component-$timestamp-v1.tar.zst.gpg";archive="$spool/$name";printf 'component=receipt-%s\ncreated=%s\ndatabase_sha256=%s\n' "$component" "$timestamp" "$(sha256sum "$work/database.sqlite"|cut -d' ' -f1)">"$work/manifest.txt"
if [[ "$component" == signer ]];then
 secret="$root/secrets/provider-secret-key";pubkey="$root/config/provider-pubkey";[[ -f "$secret" && ! -L "$secret" && -O "$secret" && -f "$pubkey" && ! -L "$pubkey" && -O "$pubkey" && "$(stat -c '%a:%h' "$secret")" == 600:1 && "$(stat -c '%a:%h' "$pubkey")" == 600:1 && "$(realpath "$secret")" == "$secret" && "$(realpath "$pubkey")" == "$pubkey" ]]||exit 1
 "$node_bin" "$pair_verify" pair "$secret" "$pubkey"|grep -qx RECEIPT_KEY_PAIR_OK
 printf 'provider_secret_sha256=%s\nprovider_pubkey_sha256=%s\n' "$(sha256sum "$secret"|cut -d' ' -f1)" "$(sha256sum "$pubkey"|cut -d' ' -f1)">>"$work/manifest.txt"
 tar --zstd --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$work" -C "$root/secrets" -cf - provider-secret-key -C "$root/config" provider-pubkey -C "$work" database.sqlite manifest.txt|"$gpg_bin" --batch --quiet --homedir "$gnupg" --trust-model always --recipient "$fingerprint" --encrypt --output "$archive"
else tar --zstd --sort=name --mtime='1980-01-01 UTC' --owner=0 --group=0 --numeric-owner -C "$work" -cf - database.sqlite manifest.txt|"$gpg_bin" --batch --quiet --homedir "$gnupg" --trust-model always --recipient "$fingerprint" --encrypt --output "$archive";fi
chmod 600 "$archive";sha="$(sha256sum "$archive"|cut -d' ' -f1)";size="$(stat -c '%s' "$archive")";receipt="$(ssh -F "$ssh_config" payout-backup-receiver "upload $name"<"$archive")";[[ "$receipt" == "stored $name $sha $size" ]]||exit 1
printf '%s %s %s\n' "$timestamp" "$sha" "$size">"$spool/last-success";chmod 600 "$spool/last-success";find "$spool" -maxdepth 1 -type f -name 'receipt-*.tar.zst.gpg' -mtime +2 -delete
printf 'Encrypted receipt-%s backup stored and verified: %s\n' "$component" "$name"
