#!/usr/bin/env sh
set -eu
umask 077
root="${BITCOINWALK_SPONSOR_PAYOUT_ROOT:-$HOME/.local/state/bitcoinwalk-sponsor-payout}"
state="$root/state";backups="$root/backups";runtime="${BITCOINWALK_SPONSOR_PAYOUT_IMAGE:-bitcoinwalk-sponsor-payout:0.1.0}"
fail(){ printf '%s\n' 'Sponsor payout backup failed.' >&2;exit 1; }
[ "$(id -u)" -ne 0 ] || fail
[ -d "$state" ] && [ ! -L "$state" ] || fail
mkdir -p "$backups";chmod 700 "$backups";[ ! -L "$backups" ] || fail
work=$(mktemp -d);trap 'rm -rf -- "$work"' EXIT HUP INT TERM
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
 --mount "type=bind,src=$state,dst=/var/lib/bitcoinwalk-sponsor-payout" --mount "type=bind,src=$work,dst=/backup" \
 --entrypoint node "$runtime" /app/backup-sqlite-online.mjs /var/lib/bitcoinwalk-sponsor-payout/service.sqlite /backup/service.sqlite >/dev/null || fail
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 0:0 \
 --mount "type=bind,src=$work,dst=/backup,readonly" --entrypoint node "$runtime" /app/verify-sponsor-payout-restore.cjs /backup/service.sqlite | grep -qx SPONSOR_PAYOUT_RESTORE_OK || fail
stamp=$(date -u +%Y%m%dT%H%M%SZ);target="$backups/service-$stamp.sqlite";install -m 600 "$work/service.sqlite" "$target"
sha=$(sha256sum "$target"|cut -d' ' -f1);printf '%s %s %s\n' "$stamp" "$sha" "$(stat -c '%s' "$target")" > "$backups/last-success";chmod 600 "$backups/last-success"
find "$backups" -maxdepth 1 -type f -name 'service-*.sqlite' -mtime +7 -delete
printf 'SPONSOR_PAYOUT_BACKUP_OK %s\n' "$target"
