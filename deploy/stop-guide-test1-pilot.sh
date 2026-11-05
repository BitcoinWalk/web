#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run with sudo on Relays.' >&2; exit 1; }
status=0
/opt/bitcoinwalk-app-staging/runtime/bin/node <<'NODE' || status=$?
const fs=require("node:fs"),path="/etc/bitcoinwalk-guide/private-pilot-policy.json";
if(fs.existsSync(path)){
 const stat=fs.lstatSync(path);if(!stat.isFile()||stat.uid!==0)throw Error("Unsafe policy file; stop the pilot unit and review manually.");
 const policy=JSON.parse(fs.readFileSync(path,"utf8"));policy.enabled=false;
 const next=path+".stop-"+process.pid;
 fs.writeFileSync(next,JSON.stringify(policy)+"\n",{flag:"wx",mode:0o644});fs.chmodSync(next,0o644);fs.renameSync(next,path);
}
NODE
if test "$(systemctl show bitcoinwalk-guide-test1-pilot.service -p LoadState --value 2>/dev/null || true)" != not-found; then
 systemctl stop bitcoinwalk-guide-test1-pilot.service || status=$?
fi
if test "$status" = 0; then echo 'Test1 pilot stopped. The normal Guide worker and delivery records were not changed.'; else echo 'Pilot stop needs manual verification; inspect the error above.' >&2; fi
exit "$status"
