import {DatabaseSync} from "node:sqlite";

const path=process.argv[2];
if(!path)throw new Error("Provide the exact application database path.");
const db=new DatabaseSync(path);
try{
  db.exec("BEGIN IMMEDIATE");
  const eligible=db.prepare(`SELECT jobKey FROM city_logo_job
    WHERE templateVersion='city-logo-inkscape-v1.3' AND state='failed' AND attempts>=8
      AND lastError='render-or-approval-check-failed' AND artifactPath IS NULL`).all();
  const now=Math.floor(Date.now()/1000);
  const result=db.prepare(`UPDATE city_logo_job SET state='queued',attempts=0,nextAttemptAt=?,
    leaseUntil=NULL,leaseToken=NULL,lastError='renderer-v1.3-retry',updatedAt=?
    WHERE templateVersion='city-logo-inkscape-v1.3' AND state='failed' AND attempts>=8
      AND lastError='render-or-approval-check-failed' AND artifactPath IS NULL`).run(now,now);
  if(result.changes!==eligible.length)throw new Error("Logo retry selection changed during the transaction.");
  db.exec("COMMIT");
  console.log(JSON.stringify({database:path,requeued:result.changes}));
}catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
}finally{db.close();}
