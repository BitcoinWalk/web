#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(id -u)" -ne 0 ]]||{ echo "Run as the staging application owner, not root." >&2;exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."&&pwd)";lib="$HOME/.local/libexec/bitcoinwalk-notification-runner";units="$HOME/.config/systemd/user";config_dir="$HOME/.config/bitcoinwalk";config="$config_dir/notification-runner-staging.env";source_config="$config_dir/app.env";dropin="$units/bitcoinwalk-app-staging.service.d/notification-sender.conf"
[[ -f "$source_config" && ! -L "$source_config" && "$(stat -c %a "$source_config")" == 600 ]]||{ echo "Staging application configuration is unavailable or unsafe." >&2;exit 1; }
mapfile -t tokens < <(sed -n 's/^BITCOINWALK_NOTIFICATION_RUN_TOKEN=//p' "$source_config")
[[ "${#tokens[@]}" -eq 1 && "${tokens[0]}" =~ ^[A-Za-z0-9_-]{32,}$ ]]||{ echo "Staging notification runner credential is invalid." >&2;exit 1; }
backup="$(mktemp -d "$HOME/backups/notification-sender-install.XXXXXX")";chmod 700 "$backup"
targets=("$lib/run-web-notification-scan.mjs" "$units/bitcoinwalk-notification-sender.service" "$units/bitcoinwalk-notification-sender.timer" "$config" "$dropin")
for target in "${targets[@]}";do [[ ! -L "$target" ]]||{ echo "Refusing symbolic-link install target." >&2;exit 1; };name="${target#"$HOME"/}";copy="$backup/${name//\//__}";if [[ -e "$target" ]];then cp -p -- "$target" "$copy";else touch "$copy.absent";fi;done
preview_enabled=0;systemctl --user is-enabled --quiet bitcoinwalk-notification-preview.timer&&preview_enabled=1
rollback(){ systemctl --user disable --now bitcoinwalk-notification-sender.timer >/dev/null 2>&1||true;for target in "${targets[@]}";do name="${target#"$HOME"/}";copy="$backup/${name//\//__}";if [[ -f "$copy.absent" ]];then rm -f -- "$target";else install -D -m "$(stat -c %a "$copy")" "$copy" "$target";fi;done;systemctl --user daemon-reload;systemctl --user restart bitcoinwalk-app-staging.service >/dev/null 2>&1||true;if [[ "$preview_enabled" == 1 ]];then systemctl --user enable --now bitcoinwalk-notification-preview.timer >/dev/null 2>&1||true;fi;}
trap rollback ERR
install -D -m 755 "$root/scripts/run-web-notification-scan.mjs" "$lib/run-web-notification-scan.mjs"
install -D -m 644 "$root/deploy/bitcoinwalk-notification-sender.service" "$units/bitcoinwalk-notification-sender.service"
install -D -m 644 "$root/deploy/bitcoinwalk-notification-sender.timer" "$units/bitcoinwalk-notification-sender.timer"
mkdir -p -m 700 "$config_dir";printf 'BITCOINWALK_NOTIFICATION_RUN_TOKEN=%s\n' "${tokens[0]}" >"$config";chmod 600 "$config"
mkdir -p "$units/bitcoinwalk-app-staging.service.d";printf '[Service]\nEnvironment=BITCOINWALK_NOTIFICATION_SENDERS_ENABLED=1\n' >"$dropin";chmod 600 "$dropin"
systemctl --user disable --now bitcoinwalk-notification-preview.timer
systemctl --user daemon-reload
systemctl --user restart bitcoinwalk-app-staging.service
[[ "$(systemctl --user is-active bitcoinwalk-app-staging.service)" == active ]]
ready=false
for attempt in {1..30};do
 if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz >/dev/null;then ready=true;break;fi
 sleep 1
done
[[ "$ready" == true ]]
systemctl --user enable --now bitcoinwalk-notification-sender.timer
systemctl --user start bitcoinwalk-notification-sender.service
[[ "$(systemctl --user is-active bitcoinwalk-notification-sender.timer)" == active ]]
[[ "$(systemctl --user is-enabled bitcoinwalk-notification-preview.timer)" == disabled ]]
trap - ERR
printf 'Recurring staging notification sender accepted. Backup: %s\n' "$backup"
