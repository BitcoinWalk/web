#!/bin/bash
set -euo pipefail
umask 077
test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk.' >&2; exit 1; }
test "$#" -eq 3 && test "$2" = --expected-current || { echo 'Usage: deploy-staging-app-user.sh ARCHIVE --expected-current RESOLVED_CURRENT_PATH' >&2; exit 1; }
archive=$(readlink -f "$1")
expected_current=$3
profile=staging
base=$(basename "$archive")
case "$base" in app-staging-*.tar.gz) ;; *) exit 1;; esac
release=${base#app-staging-}; release=${release%.tar.gz}
releases=/opt/bitcoinwalk-app-staging/releases
current=/opt/bitcoinwalk-app-staging/current
cache=/var/cache/bitcoinwalk-app-staging
database=/var/lib/bitcoinwalk-app-staging/payments.sqlite
runtime=/opt/bitcoinwalk-app-staging/runtime/bin/node
export XDG_RUNTIME_DIR=/run/user/$(id -u)
source "$(dirname "$0")/app-deploy-guard.sh"
app_deploy_guard
systemctl --user is-enabled bitcoinwalk-app-staging.service >/dev/null
backup=$(mktemp -d /home/bitcoinwalk/backups/app-staging-deploy.XXXXXX)
readlink -f "$current" >"$backup/current.before"
systemctl --user cat bitcoinwalk-app-staging.service >"$backup/service"
sha256sum /home/bitcoinwalk/.config/bitcoinwalk/app.env >"$backup/app-env.sha256"
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
systemctl --user stop bitcoinwalk-app-staging.service
if test -f "$database"; then
  "$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
fi
replacement="$current.next.$$"
ln -s "$target" "$replacement"
mv -Tf "$replacement" "$current"
systemctl --user start bitcoinwalk-app-staging.service
ready=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3338/api/healthz | grep -Fq "\"release\":\"app-staging-$release\""; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
test "$(systemctl --user show bitcoinwalk-app-staging.service -p MainPID --value)" -gt 0
sha256sum "$archive" "$target/.next/BUILD_ID" >"$backup/accepted.sha256"
echo "Staging app $release accepted. Evidence: $backup"
echo "Active release: $target"
