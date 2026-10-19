import {DatabaseSync} from "node:sqlite";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {describe,expect,it} from "vitest";

describe("city logo renderer recovery",()=>{
  it("requeues only exhausted artifact-free v1.3 renderer failures",()=>{
    const root=mkdtempSync(join(tmpdir(),"logo-retry-")),path=join(root,"payments.sqlite"),db=new DatabaseSync(path);
    try{
      db.exec(`CREATE TABLE city_logo_job(jobKey TEXT PRIMARY KEY,templateVersion TEXT,state TEXT,attempts INTEGER,nextAttemptAt INTEGER,leaseUntil INTEGER,leaseToken TEXT,lastError TEXT,artifactPath TEXT,updatedAt INTEGER);
        INSERT INTO city_logo_job VALUES
        ('retry','city-logo-inkscape-v1.3','failed',8,99,NULL,NULL,'render-or-approval-check-failed',NULL,1),
        ('bounded','city-logo-inkscape-v1.3','failed',7,99,NULL,NULL,'render-or-approval-check-failed',NULL,1),
        ('artifact','city-logo-inkscape-v1.3','failed',8,99,NULL,NULL,'render-or-approval-check-failed','/kept',1),
        ('old','city-logo-inkscape-v1.2','failed',8,99,NULL,NULL,'render-or-approval-check-failed',NULL,1);`);
      db.close();
      const result=spawnSync(process.execPath,[join(process.cwd(),"deploy/retry-city-logo-jobs-v1.3.mjs"),path],{encoding:"utf8"});
      expect(result.status,result.stderr).toBe(0);
      const after=new DatabaseSync(path,{readOnly:true});
      expect(after.prepare("SELECT state,attempts,lastError FROM city_logo_job WHERE jobKey='retry'").get()).toEqual({state:"queued",attempts:0,lastError:"renderer-v1.3-retry"});
      expect(after.prepare("SELECT state,attempts FROM city_logo_job WHERE jobKey!='retry' ORDER BY jobKey").all()).toEqual([
        {state:"failed",attempts:8},{state:"failed",attempts:7},{state:"failed",attempts:8},
      ]);
      after.close();
    }finally{try{db.close();}catch{}rmSync(root,{recursive:true,force:true});}
  });

  it("pins the reviewed renderer archive digest and restarts only the two app services",()=>{
    const source=readFileSync("deploy/install-city-logo-renderer-v1.3.sh","utf8");
    expect(source).toContain("02f0facd0945f97472184e089e9c42a83bc8d7b08ec8c3574613ab9d094ac6d0");
    expect(source).toContain("bitcoinwalk-app-staging.service bitcoinwalk-app-production.service");
    expect(source).not.toContain("sudo");
  });

  it("moves only stale v1.2 artifacts aside before requeueing v1.3 jobs",()=>{
    const root=mkdtempSync(join(tmpdir(),"logo-stale-")),path=join(root,"payments.sqlite"),assets=join(root,"assets"),backup=join(root,"backup"),db=new DatabaseSync(path);
    try{
      db.exec(`CREATE TABLE city_logo_job(jobKey TEXT PRIMARY KEY,slug TEXT,templateVersion TEXT,state TEXT,attempts INTEGER,nextAttemptAt INTEGER,leaseUntil INTEGER,leaseToken TEXT,lastError TEXT,artifactPath TEXT,updatedAt INTEGER);
        INSERT INTO city_logo_job VALUES ('${"a".repeat(64)}','madeira','city-logo-inkscape-v1.3','failed',1,99,NULL,NULL,'render-or-approval-check-failed',NULL,1);`);
      db.close();
      const artifact=join(assets,".jobs","a".repeat(64),"madeira");mkdirSync(artifact,{recursive:true});
      writeFileSync(join(artifact,"manifest.json"),JSON.stringify({templateVersion:"city-logo-inkscape-v1.2"}));
      const result=spawnSync(process.execPath,[join(process.cwd(),"deploy/recover-stale-city-logo-jobs-v1.3.mjs"),path,assets,backup],{encoding:"utf8"});
      expect(result.status,result.stderr).toBe(0);
      const after=new DatabaseSync(path,{readOnly:true});
      expect(after.prepare("SELECT state,attempts,lastError FROM city_logo_job").get()).toEqual({state:"queued",attempts:0,lastError:"stale-v1.2-artifact-recovered"});
      after.close();
      expect(existsSync(join(backup,"a".repeat(64),"madeira","manifest.json"))).toBe(true);
      expect(existsSync(join(assets,".jobs","a".repeat(64)))).toBe(false);
    }finally{try{db.close();}catch{}rmSync(root,{recursive:true,force:true});}
  });
});
