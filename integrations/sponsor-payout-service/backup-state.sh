#!/usr/bin/env sh
set -eu
umask 077
root="${BITCOINWALK_SPONSOR_PAYOUT_ROOT:-$HOME/.local/state/bitcoinwalk-sponsor-payout}"
state="$root/state";backups="$root/backups";bin="$HOME/.local/libexec/bitcoinwalk-sponsor-payout";runtime=/usr/bin/python3
fail(){ printf '%s\n' 'Sponsor payout backup failed.' >&2;exit 1; }
[ "$(id -u)" -ne 0 ] || fail
[ -d "$state" ] && [ ! -L "$state" ] || fail
mkdir -p "$backups";chmod 700 "$backups";[ ! -L "$backups" ] || fail
work=$(mktemp -d);trap 'rm -rf -- "$work"' EXIT HUP INT TERM
[ -x "$runtime" ] && [ -f "$bin/state-tool.py" ] || fail
"$runtime" "$bin/state-tool.py" backup "$state/service.sqlite" "$work/service.sqlite" | grep -qx SPONSOR_PAYOUT_BACKUP_COPY_OK || fail
"$runtime" "$bin/state-tool.py" verify-backup "$work/service.sqlite" | grep -qx SPONSOR_PAYOUT_RESTORE_OK || fail
stamp=$(date -u +%Y%m%dT%H%M%SZ);target="$backups/service-$stamp.sqlite";install -m 600 "$work/service.sqlite" "$target"
sha=$(sha256sum "$target"|cut -d' ' -f1);printf '%s %s %s\n' "$stamp" "$sha" "$(stat -c '%s' "$target")" > "$backups/last-success";chmod 600 "$backups/last-success"
find "$backups" -maxdepth 1 -type f -name 'service-*.sqlite' -mtime +7 -delete
printf 'SPONSOR_PAYOUT_BACKUP_OK %s\n' "$target"
