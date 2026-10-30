#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";work="$(mktemp -d)";trap 'rm -rf -- "$work"' EXIT;chmod 700 "$work";export GNUPGHOME="$work/gnupg";mkdir -m 700 "$GNUPGHOME"
gpg --batch --passphrase '' --quick-generate-key 'BitcoinWalk disposable backup test' rsa2048 encr 0 >/dev/null 2>&1
fingerprint="$(gpg --batch --with-colons --list-keys|awk -F: '$1=="fpr"{print $10;exit}')";gpg --batch --armor --export "$fingerprint" >"$work/recipient.asc"
node - "$work/source.sqlite" <<'JS'
const {DatabaseSync}=require("node:sqlite"),db=new DatabaseSync(process.argv[2]);
db.exec("CREATE TABLE web_push_subscription(id TEXT);CREATE TABLE web_push_subscription_audit(id INTEGER);CREATE TABLE web_notification(id TEXT);CREATE TABLE web_notification_delivery(noticeId TEXT,deviceId TEXT);INSERT INTO web_push_subscription VALUES('device');INSERT INTO web_notification VALUES('notice')");db.close();
JS
"$root/deploy/backup-web-notification-state.sh" "$work/source.sqlite" "$work/recipient.asc" "$fingerprint" "$work/notification-state.tar.gpg"
"$root/deploy/verify-web-notification-backup.sh" "$work/notification-state.tar.gpg"|grep -qx 'WEB_NOTIFICATION_RESTORE_REHEARSAL_OK live_database_unchanged=yes'
cp "$work/notification-state.tar.gpg" "$work/corrupt.tar.gpg";truncate -s -16 "$work/corrupt.tar.gpg"
if "$root/deploy/verify-web-notification-backup.sh" "$work/corrupt.tar.gpg" >/dev/null 2>&1;then echo "Corrupt backup was accepted." >&2;exit 1;fi
printf 'WEB_NOTIFICATION_BACKUP_SMOKE_OK\n'
