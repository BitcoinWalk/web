#!/usr/bin/env node
import {readFileSync,renameSync,mkdirSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";

const [databasePath,assetRoot,backupRoot]=process.argv.slice(2);
if(!databasePath||!assetRoot||!backupRoot)throw new Error("Usage: recover-stale-city-logo-jobs-v1.3.mjs <database> <asset-root> <backup-root>");
const jobsRoot=resolve(assetRoot,".jobs"),safeBackup=resolve(backupRoot);
mkdirSync(safeBackup,{recursive:true,mode:0o750});
const db=new DatabaseSync(databasePath);
const rows=db.prepare(`SELECT jobKey FROM city_logo_job
  WHERE templateVersion='city-logo-inkscape-v1.3' AND state='failed'
    AND artifactPath IS NULL AND lastError='render-or-approval-check-failed'`).all();
let recovered=0;
for(const {jobKey} of rows){
  if(!/^[a-f0-9]{64}$/.test(jobKey))throw new Error("Invalid city-logo job key");
  const source=join(jobsRoot,jobKey);
  if(!existsSync(source))continue;
  const manifests=[];
  for(const slug of db.prepare("SELECT slug FROM city_logo_job WHERE jobKey=?").all(jobKey)){
    const path=join(source,slug.slug,"manifest.json");
    if(existsSync(path))manifests.push(JSON.parse(readFileSync(path,"utf8")));
  }
  if(!manifests.length||manifests.some(manifest=>manifest.templateVersion!=="city-logo-inkscape-v1.2"))continue;
  const destination=join(safeBackup,jobKey);
  if(existsSync(destination))throw new Error(`Backup already exists for ${jobKey}`);
  renameSync(source,destination);
  const now=Math.floor(Date.now()/1000);
  db.prepare(`UPDATE city_logo_job SET state='queued',attempts=0,nextAttemptAt=?,leaseUntil=NULL,
    leaseToken=NULL,lastError='stale-v1.2-artifact-recovered',updatedAt=? WHERE jobKey=?`).run(now,now,jobKey);
  recovered+=1;
}
db.close();
console.log(JSON.stringify({database:databasePath,recovered}));
