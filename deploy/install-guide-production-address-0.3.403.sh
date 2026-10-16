#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk
export XDG_RUNTIME_DIR=/run/user/$(id -u)

current=/home/bitcoinwalk/apps/bitcoinwalk-production/current
previous=/home/bitcoinwalk/apps/bitcoinwalk-production/releases/0.3.397-8af4db5fcbda
archive=/home/bitcoinwalk/incoming/app-production-0.3.403.tar.gz
nip05_installer=/home/bitcoinwalk/incoming/install-named-nip05.cjs
address_installer=/home/bitcoinwalk/incoming/install-standalone-addresses.cjs
database=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
environment=/home/bitcoinwalk/.config/bitcoinwalk/production.env
release_environment=/home/bitcoinwalk/.config/bitcoinwalk/production-release.env
unit=bitcoinwalk-app-production.service
runtime=/home/bitcoinwalk/apps/bitcoinwalk-production/runtime/bin/node
guide_pubkey=9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c

test "$(readlink -f "$current")" = "$previous"
test "$(curl -fsS --max-time 5 http://127.0.0.1:3345/api/healthz)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.397"}'
for file in "$archive" "$archive.sha256" "$nip05_installer" "$address_installer" "$database" "$environment" "$release_environment";do
  test -f "$file" && test ! -L "$file"
done
grep -Fxq 'BITCOINWALK_RUSTRESS_NIP05_ENABLED=1' "$environment"
grep -Fxq 'BITCOINWALK_RUSTRESS_STANDALONE_LNURL_ENABLED=1' "$environment"

backup=$(mktemp -d /home/bitcoinwalk/backups/guide-production-address.XXXXXX)
cp -p "$release_environment" "$backup/production-release.env"
"$runtime" /home/bitcoinwalk/bin/backup-sqlite-online.mjs "$database" "$backup/payments.sqlite"
rollback(){
  status=$?
  if test "$status" -ne 0;then
    systemctl --user stop "$unit" || true
    rm -f "$database-wal" "$database-shm"
    cp -p "$backup/payments.sqlite" "$database"
    cp -p "$backup/production-release.env" "$release_environment"
    ln -s "$previous" "$current.rollback.$$"
    mv -Tf "$current.rollback.$$" "$current"
    systemctl --user start "$unit" || true
    echo "Guide address cutover failed; restored 0.3.397. Evidence: $backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT

/home/bitcoinwalk/bin/deploy-production-app "$archive"
systemctl --user stop "$unit"
"$runtime" "$nip05_installer" "$database" guide "$guide_pubkey" | tee "$backup/nip05-install-result"
"$runtime" "$address_installer" "$database" | tee "$backup/address-install-result"
systemctl --user start "$unit"

ready=false
for attempt in $(seq 1 40);do
  if test "$(curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz 2>/dev/null || true)" = '{"status":"ok","app":"bitcoinwalk-web","release":"app-production-0.3.403"}';then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true

GUIDE_PUBKEY="$guide_pubkey" "$runtime" - <<'NODE'
const expected=process.env.GUIDE_PUBKEY;
async function json(url){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);return {response,body:await response.json()};}
const identity=await json("https://bitcoinwalk.org/.well-known/nostr.json?name=guide");
if(identity.response.headers.get("access-control-allow-origin")!=="*"||identity.body.names?.guide!==expected)throw new Error("Guide NIP-05 read-back differs");
const address=await json("https://bitcoinwalk.org/.well-known/lnurlp/guide");
const metadata=JSON.parse(address.body.metadata);
if(address.response.headers.get("access-control-allow-origin")!=="*"||address.body.tag!=="payRequest"||address.body.callback!=="https://getalby.com/lnurlp/bitcoinwalk/callback"||address.body.minSendable!==1000||address.body.maxSendable!==10000000000||address.body.allowsNostr!==true||address.body.nostrPubkey!=="79f00d3f5a19ec806189fcab03c1be4ff81d18ee4f653c88fac41fe03570f432"||JSON.stringify(metadata)!==JSON.stringify([["text/identifier","guide@bitcoinwalk.org"],["text/plain","Support BitcoinWalk Guide"]]))throw new Error("Guide LNURL read-back differs");
const invoice=await json(`${address.body.callback}?amount=1000`);
if(typeof invoice.body.pr!=="string"||!invoice.body.pr.toLowerCase().startsWith("lnbc"))throw new Error("Guide backing receiver did not issue an unpaid invoice");
for(const name of ["endo","donate"]){const existing=await json(`https://bitcoinwalk.org/.well-known/lnurlp/${name}`);if(existing.body.callback!==address.body.callback||existing.body.nostrPubkey!==address.body.nostrPubkey)throw new Error(`${name} alias changed`);}
NODE

trap - EXIT
echo "GUIDE_PRODUCTION_ADDRESS_0.3.403_OK evidence=$backup"
