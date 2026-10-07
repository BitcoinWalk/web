#!/bin/bash
# Routine production app release activation. Runs entirely as bitcoinwalk.
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk.' >&2; exit 1; }
test "$#" -eq 1 || { echo 'Usage: deploy-production-app-user.sh /path/to/app-production-X.Y.Z.tar.gz' >&2; exit 1; }

archive=$(readlink -f "$1")
checksum="$archive.sha256"
base=$(basename "$archive")
case "$base" in app-production-*.tar.gz) ;; *) echo 'Archive name must be app-production-X.Y.Z.tar.gz.' >&2; exit 1;; esac
release=${base#app-production-}; release=${release%.tar.gz}
test -f "$archive"
test -f "$checksum" || { echo "Missing checksum: $checksum" >&2; exit 1; }
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum")")

digest=$(sha256sum "$archive" | cut -d' ' -f1)
root=/home/bitcoinwalk/apps/bitcoinwalk-production
releases="$root/releases"
target="$releases/$release-${digest:0:12}"
current="$root/current"
cache=/home/bitcoinwalk/.cache/bitcoinwalk-app-production
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
backup_root=/home/bitcoinwalk/backups
runtime="$root/runtime/bin/node"
release_env=/home/bitcoinwalk/.config/bitcoinwalk/production-release.env
export XDG_RUNTIME_DIR=/run/user/$(id -u)

test -x "$runtime"
for directory in "$releases" "$cache" "$(dirname "$database")" "$backup_root"; do test -d "$directory" && test -w "$directory"; done
mkdir -p "$backup_root"
evidence=$(mktemp -d "$backup_root/app-production-deploy.XXXXXX")
sha256sum /home/bitcoinwalk/.config/bitcoinwalk/app.env /home/bitcoinwalk/.config/bitcoinwalk/production.env >"$evidence/environment-files.sha256"
systemctl --user cat bitcoinwalk-app-production.service >"$evidence/service"
if test -L "$current"; then readlink -f "$current" >"$evidence/current.before"; fi

if test ! -d "$target"; then
  staging="$target.staging.$$"
  mkdir "$staging"
  tar -tzf "$archive" | awk 'BEGIN{bad=0} /^\//||/(^|\/)\.\.($|\/)/{bad=1} END{exit bad}'
  tar -xzf "$archive" -C "$staging"
  test -f "$staging/server.js"
  test -f "$staging/.next/BUILD_ID"
  test ! -e "$staging/.next/cache"
  ln -s "$cache" "$staging/.next/cache"
  mv "$staging" "$target"
fi

if systemctl --user is-active --quiet bitcoinwalk-app-production.service; then
  systemctl --user stop bitcoinwalk-app-production.service
fi
if test -f "$database"; then
  "$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$evidence/payments.sqlite"
fi
printf 'BITCOINWALK_APP_RELEASE=app-production-%s\n' "$release" >"$release_env.next"
chmod 0600 "$release_env.next"
mv "$release_env.next" "$release_env"
replacement="$current.next.$$"
ln -s "$target" "$replacement"
mv -Tf "$replacement" "$current"
systemctl --user daemon-reload
systemctl --user enable --now bitcoinwalk-app-production.service

ready=false
for attempt in $(seq 1 40); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3345/api/healthz | grep -Fq "\"release\":\"app-production-$release\""; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
test "$(systemctl --user show bitcoinwalk-app-production.service -p MainPID --value)" -gt 0
sha256sum "$archive" "$target/.next/BUILD_ID" >"$evidence/accepted.sha256"
echo "Production app $release accepted privately as bitcoinwalk. Evidence: $evidence"
echo "Active release: $target"
