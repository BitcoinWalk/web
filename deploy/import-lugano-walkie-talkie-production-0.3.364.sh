#!/bin/bash
set -euo pipefail
umask 077

test "$(id -un)" = bitcoinwalk || { echo 'Run as bitcoinwalk.' >&2; exit 1; }
test "$#" -eq 0 || { echo "Usage: $0" >&2; exit 1; }

root=/home/bitcoinwalk/apps/bitcoinwalk-production
runtime="$root/runtime/bin/node"
backup_helper=/home/bitcoinwalk/bin/backup-sqlite-online.mjs
source=/var/lib/bitcoinwalk-app-staging/payments.sqlite
target=/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite
unit=bitcoinwalk-app-production.service
city=7877ca26-dbe2-4dae-a7f7-483d94ce283a
backup=$(mktemp -d /home/bitcoinwalk/backups/lugano-walkie-talkie-production.XXXXXX)

test -x "$runtime"
test -f "$backup_helper"
test -r "$source"
test -r "$target" && test -w "$target"
"$runtime" "$backup_helper" "$target" "$backup/payments.before.sqlite"

completed=false
recover() {
  status=$?
  trap - EXIT HUP INT TERM
  if ! "$completed"; then
    systemctl --user stop "$unit" >/dev/null 2>&1 || true
    rm -f "$target-wal" "$target-shm"
    cp -p "$backup/payments.before.sqlite" "$target"
    systemctl --user start "$unit" >/dev/null 2>&1 || true
    echo "Lugano Walkie Talkie import failed; production payments database restored. Evidence: $backup" >&2
  fi
  exit "$status"
}
trap recover EXIT HUP INT TERM

systemctl --user stop "$unit"
"$runtime" - "$source" "$target" "$city" <<'NODE'
const {DatabaseSync}=require("node:sqlite");
const [sourcePath,targetPath,cityId]=process.argv.slice(2);
const expected={
 cityId,
 authorityId:"45424b887a2e20da23bef6eb72aebaeb89330b1e1ca4518cde9205cfe5b4e767",
 tier:"basic",
 slug:"lugano",
 relay:"wss://chat.bitcoinwalk.org/",
 groupId:"bitcoinwalk-lugano",
 phase:"active",
 evidenceDigest:"0389474fba0543d2d67b6d7ee99e6aae3f505597b05f852e9a9a6cfc50dac364",
 metadataEventId:"5d12ba579aa31a5f3c416b6ccc3a147c2918bac96fb207ded0ad5bbfee1d045d",
 verifiedAt:1792085554,
 activatedAt:1792085554,
 createdAt:1792085552,
 updatedAt:1792085554,
};
const source=new DatabaseSync(sourcePath,{readOnly:true});
const row=source.prepare("SELECT * FROM city_walkie_talkie_provisioning WHERE cityId=?").get(cityId);
source.close();
if(!row||JSON.stringify(row)!==JSON.stringify(expected))throw new Error("Staging Lugano Walkie Talkie evidence differs from the reviewed record.");
const target=new DatabaseSync(targetPath);
try{
 const before=target.prepare("SELECT count(*) AS n FROM city_walkie_talkie_provisioning").get().n;
 const existing=target.prepare("SELECT * FROM city_walkie_talkie_provisioning WHERE cityId=?").get(cityId);
 if(existing&&JSON.stringify(existing)!==JSON.stringify(expected))throw new Error("Production already has a different Lugano Walkie Talkie record.");
 if(!existing){
  target.exec("BEGIN IMMEDIATE");
  try{
   target.prepare(`INSERT INTO city_walkie_talkie_provisioning(cityId,authorityId,tier,slug,relay,groupId,phase,evidenceDigest,metadataEventId,verifiedAt,activatedAt,createdAt,updatedAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(expected));
   target.exec("COMMIT");
  }catch(error){target.exec("ROLLBACK");throw error;}
 }
 const after=target.prepare("SELECT count(*) AS n FROM city_walkie_talkie_provisioning").get().n;
 const accepted=target.prepare("SELECT * FROM city_walkie_talkie_provisioning WHERE cityId=?").get(cityId);
 if(JSON.stringify(accepted)!==JSON.stringify(expected)||after!==before+(existing?0:1))throw new Error("Production Lugano Walkie Talkie import was not exact.");
 console.log(JSON.stringify({before,after,row:accepted},null,2));
}finally{target.close();}
NODE

systemctl --user start "$unit"
ready=false
for _ in $(seq 1 40); do
  if curl -fsS --max-time 3 http://127.0.0.1:3345/api/healthz | grep -Fq '"release":"app-production-0.3.363"'; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
systemctl --user is-active --quiet "$unit"
"$runtime" "$backup_helper" "$target" "$backup/payments.after.sqlite"
completed=true
trap - EXIT HUP INT TERM

echo "Lugano verified Walkie Talkie routing imported into production on 0.3.364. Evidence: $backup"
echo "Only the exact active Basic-city provisioning row was copied; payments, entitlements and all other city records were unchanged."
