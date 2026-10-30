#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 && "$1" == *.tar.gpg ]]||{ echo "usage: $0 BACKUP.tar.gpg" >&2;exit 64; }
[[ -f "$1" && ! -L "$1" ]]||exit 1;ciphertext="$(realpath "$1")";[[ "$(stat -c %s "$ciphertext")" -le 536870912 ]]||exit 1
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";node_bin="${BITCOINWALK_RESTORE_NODE:-node}";gpg_bin="${BITCOINWALK_RESTORE_GPG:-gpg}"
work="$(mktemp -d)";trap 'rm -rf -- "$work"' EXIT;chmod 700 "$work"
(ulimit -f 1048576;"$gpg_bin" --batch --quiet --output "$work/archive.tar" --decrypt "$ciphertext")
mapfile -t entries < <(tar -tf "$work/archive.tar");mapfile -t types < <(tar --numeric-owner -tvf "$work/archive.tar"|awk '{print substr($1,1,1)}')
[[ "${entries[*]}" == "database.sqlite manifest.sha256 notification-report.json" && "${types[*]}" == "- - -" ]]||{ echo "Unexpected backup contents." >&2;exit 1; }
tar --no-same-owner --no-same-permissions -xf "$work/archive.tar" -C "$work"
for name in database.sqlite manifest.sha256 notification-report.json;do [[ -f "$work/$name" && ! -L "$work/$name" ]]||exit 1;done
(cd "$work"&&sha256sum -c manifest.sha256)
"$node_bin" "$root/scripts/report-web-notification-state.mjs" "$work/database.sqlite" >"$work/restored-report.json"
cmp "$work/notification-report.json" "$work/restored-report.json"
printf 'WEB_NOTIFICATION_RESTORE_REHEARSAL_OK live_database_unchanged=yes\n'
