#!/usr/bin/env bash
set -euo pipefail

city='530af607-e1c8-47f4-a5af-c200a965420b'
local_part='rye'
database='/home/bitcoinwalk/.local/state/bitcoinwalk-production/payments.sqlite'

test "$(id -un)" = bitcoinwalk
test -f "$database"
systemctl --user is-active --quiet bitcoinwalk-app-production.service

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="/home/bitcoinwalk/backups/retire-production-rye-$stamp"
install -d -m 0700 "$backup"
/opt/bitcoinwalk-app-staging/runtime/bin/node - "$database" "$backup/payments.sqlite" "$city" "$local_part" <<'JS'
const {backup,DatabaseSync}=require("node:sqlite"),[database,backupPath,city,localPart]=process.argv.slice(2);
(async()=>{
 const db=new DatabaseSync(database);
 try{
  const rows=db.prepare("SELECT phase,nip05,lnurl,activation_config FROM rustress_activation_task WHERE city=?").all(city);
  if(rows.length!==1)throw new Error("Expected exact Rye activation row");
  const row=rows[0],config=JSON.parse(row.activation_config);
  if(config.cityId!==city||config.localPart!==localPart||config.domain!=="bitcoinwalk.org"||config.invoiceIssuance!=="enabled")throw new Error("Rye activation identity changed");
  await backup(db,backupPath);
  const retired=row.phase==="blocked"&&row.nip05==="needs-attention"&&row.lnurl==="needs-attention";
  if(!retired){
   db.exec("BEGIN IMMEDIATE");
   try{
    const result=db.prepare("UPDATE rustress_activation_task SET phase='blocked',nip05='needs-attention',lnurl='needs-attention',lease=NULL,until=0,updated_at=? WHERE city=? AND phase='verifying' AND json_extract(activation_config,'$.localPart')=? AND json_extract(activation_config,'$.invoiceIssuance')='enabled'").run(Date.now(),city,localPart);
    if(result.changes!==1)throw new Error("Rye activation state changed");
    db.exec("COMMIT");
   }catch(error){db.exec("ROLLBACK");throw error;}
  }
  const checked=db.prepare("SELECT COUNT(*) count FROM rustress_activation_task WHERE city=? AND phase='blocked' AND nip05='needs-attention' AND lnurl='needs-attention'").get(city);
  if(checked.count!==1)throw new Error("Rye gateway retirement did not persist");
 }finally{db.close();}
})().catch(error=>{console.error(error instanceof Error?error.message:"Rye retirement failed");process.exitCode=1;});
JS
echo "RYE_APP_GATEWAY_RETIRED city=$city phase=blocked backup=$backup"
