import assert from "node:assert/strict";
import {readFileSync,lstatSync,mkdtempSync,writeFileSync,renameSync,existsSync,chmodSync} from "node:fs";
import {createHash} from "node:crypto";
import {dirname,join} from "node:path";
import {execFileSync} from "node:child_process";
import {DatabaseSync} from "node:sqlite";
import {persistentProPolicySchema,GUIDE_PERSISTENT_PRO_RECIPIENT} from "../src/guide/persistent-pro";
import {loadGuideKnowledge} from "../src/guide/assistant";
import {privatePilotPolicySchema} from "../src/guide/private-pilot";

const path="/etc/bitcoinwalk-guide/persistent-pro-policy.json",oldPath="/etc/bitcoinwalk-guide/private-pilot-policy.json";
let stage="arguments";
function safeRootFile(file:string){const stat=lstatSync(file);assert(stat.isFile()&&stat.uid===0&&(stat.mode&0o022)===0&&stat.size<65536);}
async function main(){
 assert.equal(process.getuid?.(),0);
 const mode=process.argv[2];assert(["--preflight","--activate","--disable"].includes(mode));assert.equal(process.argv.length,3);
 if(mode==="--disable"){
  safeRootFile(path);const policy=persistentProPolicySchema.parse(JSON.parse(readFileSync(path,"utf8"))),next=path+".disabled-"+process.pid;
  writeFileSync(next,JSON.stringify({...policy,enabled:false})+"\n",{flag:"wx",mode:0o644});chmodSync(next,0o644);renameSync(next,path);return;
 }
 assert(!existsSync(path));
 const folder=dirname(process.argv[1]),disabled=persistentProPolicySchema.parse(JSON.parse(readFileSync(join(folder,"persistent-pro-disabled.json"),"utf8")));
 assert.equal(disabled.enabled,false);assert.equal(disabled.startsAt,0);
 stage="knowledge";assert.equal(loadGuideKnowledge(join(folder,"knowledge.json")).sha256,disabled.knowledgeSha256);
 stage="expired-pilot";safeRootFile(oldPath);
 const previous=readFileSync(oldPath,"utf8");assert.equal(createHash("sha256").update(previous).digest("hex"),"51f7f93ec33bbd475d451b42d3c1383b38ebb78f5e25ce3fa1068850c4cb6aae");
 const old=privatePilotPolicySchema.parse(JSON.parse(previous));assert.equal(old.recipient,GUIDE_PERSISTENT_PRO_RECIPIENT);assert(old.expiresAt<Math.floor(Date.now()/1000));
 stage="entitlement";
 const checked=JSON.parse(execFileSync(process.execPath,[join(folder,"check-pro-entitlement.cjs")],{encoding:"utf8",env:{...process.env,GUIDE_CONFIG:"/etc/bitcoinwalk-guide/config.json",CREDENTIALS_DIRECTORY:"/etc/bitcoinwalk-guide"},timeout:15000,maxBuffer:16384}));
 assert.equal(checked.recipient,disabled.recipient);assert.equal(checked.plan,"pro");assert.equal(checked.proVerified,true);
 stage="state";
 const config=JSON.parse(readFileSync("/etc/bitcoinwalk-guide/config.json","utf8")),db=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});
 try{
  db.exec("PRAGMA busy_timeout=5000");
  assert.equal(config.proSetupStatusURL,"http://127.0.0.1:3345/api/pro-setup-notifications");assert.equal(config.support.enabled,true);
  assert.equal((db.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}).value,JSON.stringify(["9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c",config.sourceRelay]));
  assert.equal((db.prepare("SELECT COUNT(*) count FROM support_reply_v2 WHERE recipient=? AND state='pending'").get(disabled.recipient) as {count:number}).count,0);
  const baseline=db.prepare("SELECT recipient,used,cooldown_until FROM support_usage ORDER BY recipient").all();
  if(mode==="--preflight"){console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_PREFLIGHT_OK",recipient:disabled.recipient,maxCallsPerUtcDay:10,maxRepliesPerUtcDay:5,sent:false,modelCalls:0}));return;}
  stage="backup";process.umask(0o077);
  const backup=mkdtempSync("/var/backups/bitcoinwalk-guide-persistent-pro.");db.prepare("VACUUM INTO ?").run(join(backup,"guide.sqlite"));
  writeFileSync(join(backup,"baseline.json"),JSON.stringify(baseline)+"\n",{flag:"wx",mode:0o600});writeFileSync(join(backup,"expired-pilot-policy.json"),previous,{flag:"wx",mode:0o600});
  stage="activation";
  const policy=persistentProPolicySchema.parse({...disabled,enabled:true,startsAt:Math.floor(Date.now()/1000)+2});
  writeFileSync(path,JSON.stringify(policy)+"\n",{flag:"wx",mode:0o644});chmodSync(path,0o644);
  console.log(JSON.stringify({result:"GUIDE_PERSISTENT_PRO_ACTIVATED",recipient:policy.recipient,startsAt:policy.startsAt,maxCallsPerUtcDay:10,maxRepliesPerUtcDay:5,backup,sent:false,modelCalls:0}));
 }finally{db.close();}
}
main().catch(()=>{console.error(`Persistent Guide preparation failed at ${stage}; no secret values logged.`);process.exitCode=1;});
