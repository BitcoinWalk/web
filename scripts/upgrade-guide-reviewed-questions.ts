import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,lstatSync,readlinkSync,realpathSync,mkdtempSync,writeFileSync,chmodSync,renameSync,symlinkSync,mkdirSync,copyFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {reviewedUpgradePolicy} from "../src/guide/reviewed-upgrade";
import {loadGuideKnowledge} from "../src/guide/assistant";

const base="/opt/bitcoinwalk-guide-auto-pro",policyPath="/etc/bitcoinwalk-guide/persistent-pro-policy.json",unit="bitcoinwalk-guide-auto-pro.service";
const original=base+"/release",folder=dirname(realpathSync(process.argv[1]));
const run=(...args:string[])=>execFileSync("systemctl",args,{encoding:"utf8",timeout:100000}).trim();
function rootFile(path:string){const s=lstatSync(path);assert(s.isFile()&&s.uid===0&&(s.mode&0o022)===0);return s;}
function atomicPolicy(text:string){const tmp=policyPath+`.upgrade-${process.pid}`;writeFileSync(tmp,text,{flag:"wx",mode:0o644});chmodSync(tmp,0o644);renameSync(tmp,policyPath);}
function point(target:string){const tmp=base+`/current-upgrade-${process.pid}`;symlinkSync(target,tmp);renameSync(tmp,base+"/current");}
function snapshot(){
 const db=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});
 try{db.exec("PRAGMA busy_timeout=5000");return {
  usage:db.prepare("SELECT recipient,used,cooldown_until FROM support_usage ORDER BY recipient").all(),
  attempts:db.prepare("SELECT policy_id,phase,COUNT(*) count FROM guide_private_pilot_attempt GROUP BY policy_id,phase ORDER BY policy_id,phase").all(),
 };}finally{db.close();}
}
async function main(){
 assert.equal(process.getuid?.(),0);assert.equal(process.argv.length,2);process.umask(0o077);
 assert.equal(run("is-active","bitcoinwalk-guide.service"),"active");assert.equal(run("is-active",unit),"active");
 for(const path of [base,original]){const s=lstatSync(path);assert(s.isDirectory()&&s.uid===0&&(s.mode&0o022)===0);}
 for(const pilot of ["bitcoinwalk-guide-test1-pilot.service","bitcoinwalk-guide-pro-pilot.service"])
  assert.equal(run("show",pilot,"--property=ActiveState","--value"),"inactive");
 assert(lstatSync(base+"/current").isSymbolicLink());assert.equal(lstatSync(base+"/current").uid,0);
 assert.equal(realpathSync(base+"/current"),original);const oldTarget=readlinkSync(base+"/current");
 rootFile(original+"/SOURCE_COMMIT");assert.equal(readFileSync(original+"/SOURCE_COMMIT","utf8").trim(),"1a3699186e19e5900a69a4d6477be43394904aa8");
 rootFile(policyPath);const raw=readFileSync(policyPath,"utf8");
 assert.equal(createHash("sha256").update(raw).digest("hex"),"f365ac5b37a0c58543c4e0706fdcd425a3c405e734206d5f75565d06e91b8de8");
 const next=reviewedUpgradePolicy(JSON.parse(raw),Math.floor(Date.now()/1000));
 const config=JSON.parse(readFileSync("/etc/bitcoinwalk-guide/config.json","utf8"));
 assert.equal(config.proSetupStatusURL,"http://127.0.0.1:3345/api/pro-setup-notifications");assert.equal(config.support.enabled,true);
 const state=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});
 try{assert.equal((state.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}).value,JSON.stringify(["9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c",config.sourceRelay]));}finally{state.close();}
 const key=rootFile("/etc/bitcoinwalk-guide/persistent-pro-openai-key");assert.equal(key.mode&0o777,0o600);
 assert.equal(loadGuideKnowledge(join(folder,"knowledge.json")).sha256,next.knowledgeSha256);
 assert.deepEqual(readFileSync(join(folder,"knowledge.json")),readFileSync(original+"/knowledge.json"));
 assert.deepEqual(readFileSync(join(folder,"bitcoinwalk-guide-auto-pro.service")),readFileSync("/etc/systemd/system/"+unit));
 const checked=JSON.parse(execFileSync(process.execPath,[join(folder,"check-pro-entitlement.cjs")],{encoding:"utf8",timeout:15000,env:{...process.env,GUIDE_CONFIG:"/etc/bitcoinwalk-guide/config.json",CREDENTIALS_DIRECTORY:"/etc/bitcoinwalk-guide"}}));
 assert.equal(checked.recipient,next.recipient);assert.equal(checked.proVerified,true);assert.equal(checked.plan,"pro");
 const commit=readFileSync(join(folder,"SOURCE_COMMIT"),"utf8").trim();assert(/^[a-f0-9]{40}$/.test(commit));
 const target=base+"/releases/"+commit;mkdirSync(base+"/releases",{recursive:true,mode:0o755});chmodSync(base+"/releases",0o755);mkdirSync(target,{mode:0o755});chmodSync(target,0o755);
 for(const name of ["run-guide-persistent-pro.cjs","prepare-guide-persistent-pro.cjs","check-pro-entitlement.cjs","report-guide-conversations.cjs","stop-guide-persistent-pro.sh","knowledge.json","SOURCE_COMMIT"]){
  copyFileSync(join(folder,name),join(target,name));chmodSync(join(target,name),name.endsWith(".cjs")||name.endsWith(".sh")?0o755:0o644);
 }
 const backup=mkdtempSync("/var/backups/bitcoinwalk-guide-reviewed-upgrade.");
 writeFileSync(join(backup,"policy.json"),raw,{flag:"wx",mode:0o600});writeFileSync(join(backup,"previous-target"),oldTarget,{flag:"wx",mode:0o600});
 let stopped=false,changed=false;
 try{
  run("stop",unit);stopped=true;assert.equal(readFileSync(policyPath,"utf8"),raw);assert.equal(realpathSync(base+"/current"),original);
  const before=snapshot();writeFileSync(join(backup,"counters.json"),JSON.stringify(before)+"\n",{flag:"wx",mode:0o600});
  const db=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});try{db.exec("PRAGMA busy_timeout=5000");db.prepare("VACUUM INTO ?").run(join(backup,"guide.sqlite"));}finally{db.close();}
  changed=true;atomicPolicy(JSON.stringify(next)+"\n");point(target);
  assert.deepEqual(snapshot(),before);
  run("start",unit);await new Promise(resolve=>setTimeout(resolve,5000));assert.equal(run("is-active",unit),"active");
  console.log(JSON.stringify({result:"GUIDE_REVIEWED_QUESTIONS_UPGRADED",backup,recipient:next.recipient,startsAt:next.startsAt,quotaReset:false,keyChanged:false,leaderboard:"admin-only",initialHistory:"retained-messages-only"}));
 }catch{
  if(changed){run("stop",unit);atomicPolicy(raw);point(oldTarget);}
  if(stopped)run("start",unit);
  throw new Error("Upgrade failed; original worker restored without restoring or resetting the database.");
 }
}
main().catch(()=>{console.error("Reviewed Guide upgrade failed. Check service status and upgrade backup; no secret values logged.");process.exitCode=1;});
