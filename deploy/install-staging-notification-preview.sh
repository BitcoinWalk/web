#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(id -u)" -ne 0 ]]||{ echo "Run as the staging application owner, not root." >&2;exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";lib="$HOME/.local/libexec/bitcoinwalk-notification-runner";units="$HOME/.config/systemd/user";config_dir="$HOME/.config/bitcoinwalk";config="$config_dir/notification-runner-staging.env";source_config="$config_dir/app.env"
[[ -f "$source_config" && ! -L "$source_config" && "$(stat -c %a "$source_config")" == 600 ]]||{ echo "Staging application configuration is unavailable or unsafe." >&2;exit 1; }
mapfile -t tokens < <(sed -n 's/^BITCOINWALK_NOTIFICATION_RUN_TOKEN=//p' "$source_config")
[[ "${#tokens[@]}" -eq 1 && "${tokens[0]}" =~ ^[A-Za-z0-9_-]{32,}$ ]]||{ echo "Staging notification runner credential is invalid." >&2;exit 1; }
backup="$(mktemp -d "$HOME/backups/notification-preview-install.XXXXXX")";chmod 700 "$backup"
targets=("$lib/run-web-notification-scan.mjs" "$units/bitcoinwalk-notification-preview.service" "$units/bitcoinwalk-notification-preview.timer" "$config")
for target in "${targets[@]}";do [[ ! -L "$target" ]]||{ echo "Refusing symbolic-link install target." >&2;exit 1; };if [[ -e "$target" ]];then cp -p -- "$target" "$backup/$(basename "$target")";else touch "$backup/$(basename "$target").absent";fi;done
rollback(){ systemctl --user disable --now bitcoinwalk-notification-preview.timer >/dev/null 2>&1||true;for target in "${targets[@]}";do name="$(basename "$target")";if [[ -f "$backup/$name.absent" ]];then rm -f -- "$target";else install -D -m "$(stat -c %a "$backup/$name")" "$backup/$name" "$target";fi;done;systemctl --user daemon-reload; }
trap rollback ERR
install -D -m 755 "$root/scripts/run-web-notification-scan.mjs" "$lib/run-web-notification-scan.mjs"
install -D -m 644 "$root/deploy/bitcoinwalk-notification-preview.service" "$units/bitcoinwalk-notification-preview.service"
install -D -m 644 "$root/deploy/bitcoinwalk-notification-preview.timer" "$units/bitcoinwalk-notification-preview.timer"
mkdir -p -m 700 "$config_dir";printf 'BITCOINWALK_NOTIFICATION_RUN_TOKEN=%s\n' "${tokens[0]}" >"$config";chmod 600 "$config"
systemctl --user daemon-reload
systemctl --user enable --now bitcoinwalk-notification-preview.timer
systemctl --user start bitcoinwalk-notification-preview.service
[[ "$(systemctl --user is-active bitcoinwalk-notification-preview.timer)" == active ]]
trap - ERR
printf 'Read-only staging notification schedule accepted. Backup: %s\n' "$backup"
