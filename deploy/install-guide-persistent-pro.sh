#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run with sudo on Relays.' >&2; exit 1; }
umask 077
release=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$release"
sha256sum -c SHA256SUMS
node=/opt/bitcoinwalk-app-staging/runtime/bin/node
unit=bitcoinwalk-guide-auto-pro.service
policy=/etc/bitcoinwalk-guide/persistent-pro-policy.json
credential=/etc/bitcoinwalk-guide/persistent-pro-openai-key
base=/opt/bitcoinwalk-guide-auto-pro
test ! -e "$policy" && test ! -L "$policy"
test ! -e "$credential" && test ! -L "$credential"
test ! -e "$base" && test ! -L "$base"
test ! -e "/etc/systemd/system/$unit" && test ! -L "/etc/systemd/system/$unit"
systemctl is-active --quiet bitcoinwalk-guide.service
test "$(systemctl show bitcoinwalk-guide.service -p User --value)" = bitcoinwalk-guide
for other in bitcoinwalk-guide-test1-pilot.service bitcoinwalk-guide-pro-pilot.service "$unit"; do
 case "$(systemctl show "$other" -p ActiveState --value)" in inactive|failed) ;; *) echo 'Another assistant is active; refusing installation.' >&2; exit 1;; esac
done
"$node" "$release/check-guide-persistent-pro.cjs" "$release/knowledge.json"
"$node" "$release/prepare-guide-persistent-pro.cjs" --preflight
install -d -o root -g root -m 0755 "$base" "$base/release"
for file in run-guide-persistent-pro.cjs prepare-guide-persistent-pro.cjs check-pro-entitlement.cjs stop-guide-persistent-pro.sh; do install -o root -g root -m 0755 "$release/$file" "$base/release/$file"; done
for file in knowledge.json persistent-pro-disabled.json SOURCE_COMMIT; do install -o root -g root -m 0644 "$release/$file" "$base/release/$file"; done
ln -s "$base/release" "$base/current"
install -o root -g root -m 0644 "$release/$unit" "/etc/systemd/system/$unit"
systemd-analyze verify "/etc/systemd/system/$unit"
created=false
cleanup(){
 status=$?
 if test "$status" -ne 0; then
  systemctl disable --now "$unit" || true
  if test -e "$policy"; then "$node" "$base/current/prepare-guide-persistent-pro.cjs" --disable || true; fi
  if test "$created" = true; then rm -f "$credential"; fi
  echo 'Activation did not finish; assistant disabled. Installed files retained for review.' >&2
 fi
}
trap cleanup EXIT
read -rsp 'OpenAI project service-account API key (stored root-only for persistent Guide): ' guide_api_key
echo
test -n "$guide_api_key" && test "${#guide_api_key}" -le 512
set -o noclobber
printf '%s\n' "$guide_api_key" > "$credential"
set +o noclobber
created=true
unset guide_api_key
chown root:root "$credential"
chmod 0600 "$credential"
"$node" "$base/current/prepare-guide-persistent-pro.cjs" --activate
systemctl daemon-reload
systemctl enable --now "$unit"
sleep 5
systemctl is-active --quiet "$unit"
echo 'Persistent Guide is enabled for the verified Pro account only. Maximum 10 model attempts and 5 replies per UTC day.'
echo 'The API key is stored root-only and supplied through systemd credentials. Basic quotas and the normal Guide worker are unchanged.'
echo "Stop with: sudo bash $base/current/stop-guide-persistent-pro.sh"
systemctl status "$unit" --no-pager -n 8
