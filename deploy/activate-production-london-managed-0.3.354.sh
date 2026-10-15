#!/bin/sh
set -eu
phase=${1:-identity}
case "$phase" in identity) source=90-production-london-managed-identity-0.3.354.conf;; payments) source=90-production-london-managed-payments-0.3.354.conf;; *) echo 'Usage: activate-production-london-managed-0.3.354.sh identity|payments' >&2;exit 1;; esac
test "$(id -un)" = bitcoinwalk
test "$(curl -fsS --max-time 5 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.354"}'
token=/home/bitcoinwalk/.config/bitcoinwalk-rustress-managed/api-token
test -f "$token" && test ! -L "$token" && test "$(stat -c '%U:%G:%a' "$token")" = bitcoinwalk:bitcoinwalk:600
test "$(systemctl --user is-active bitcoinwalk-rustress-managed-tunnel.service)" = active
root=/home/bitcoinwalk/.config/systemd/user/bitcoinwalk-app-production.service.d
target=$root/90-london-managed.conf
backup=$(mktemp -d /home/bitcoinwalk/backups/bitcoinwalk-london-managed.XXXXXX)
mkdir -p "$root";test ! -e "$target"||cp -a "$target" "$backup/90-london-managed.conf"
cp "$source" "$target.next";chmod 600 "$target.next";mv "$target.next" "$target"
rollback(){ rm -f "$target";test ! -f "$backup/90-london-managed.conf"||cp -a "$backup/90-london-managed.conf" "$target";systemctl --user daemon-reload;systemctl --user restart bitcoinwalk-app-production.service||true;echo "London managed activation failed; prior app configuration restored. Evidence: $backup" >&2;exit 1; }
trap rollback EXIT HUP INT TERM
systemctl --user daemon-reload
systemctl --user restart bitcoinwalk-app-production.service
ready=0;i=0;while test "$i" -lt 60;do
  if curl -fsS --max-time 5 http://127.0.0.1:3345/api/healthz | grep -Fq '"release":"app-production-0.3.354"';then ready=1;break;fi
  i=$((i+1));sleep 1
done
test "$ready" -eq 1
expected=4ba507c530274e2799a1d25d2411937e07a3a38189b536290ef653251bd4255d
verified=0;i=0;while test "$i" -lt 60;do
  if curl -fsS --max-time 8 'https://bitcoinwalk.org/.well-known/nostr.json?name=london' | grep -Fq "$expected";then verified=1;break;fi
  i=$((i+1));sleep 5
done
test "$verified" -eq 1
/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node verify-production-london-managed-0.3.354.mjs >"$backup/accepted-public-policy.json"
if test "$phase" = identity;then
  code=$(curl -sS -o "$backup/lnurl-closed.json" -w '%{http_code}' --max-time 8 https://bitcoinwalk.org/.well-known/lnurlp/london)
  test "$code" = 404
else
  curl -fsS --max-time 8 https://bitcoinwalk.org/.well-known/lnurlp/london >"$backup/lnurl-active.json"
  grep -Fq '"tag":"payRequest"' "$backup/lnurl-active.json"
  grep -Fq 'https://bitcoinwalk.org/lnurlp/london/' "$backup/lnurl-active.json"
fi
trap - EXIT HUP INT TERM
echo "London managed $phase accepted on app 0.3.354. Evidence: $backup"
