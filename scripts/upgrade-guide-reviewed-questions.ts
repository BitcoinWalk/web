import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,lstatSync,readlinkSync,realpathSync,mkdtempSync,writeFileSync,chmodSync,chownSync,renameSync,symlinkSync,mkdirSync} from "node:fs";
import {dirname,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {nip19} from "nostr-tools";
import {reviewedUpgradePolicy,twoProUpgradePolicy} from "../src/guide/reviewed-upgrade";
import {GUIDE_SECOND_PRO_RECIPIENT} from "../src/guide/persistent-pro";
import {loadGuideKnowledge} from "../src/guide/assistant";
import {installGuideRootFile} from "../src/guide/install-root-file";

const base="/opt/bitcoinwalk-guide-auto-pro",policyPath="/etc/bitcoinwalk-guide/persistent-pro-policy.json",unit="bitcoinwalk-guide-auto-pro.service";
const addSecond=process.argv[2]==="--add-second-pro";
const original=addSecond?base+"/releases/b2556250efea3b26418178a1713a6fac96fe7910":base+"/release",folder=dirname(realpathSync(process.argv[1]));
let stage="preflight";
const previousHashes={
 "SOURCE_COMMIT":"6d0eebe97355c559d0d94669db1532e0ca9dd7f1ca718a1acb69eb1030abef2e",
 "run-guide-persistent-pro.cjs":"a6a930cd7e952c9a50296ec7d59f222f48d94c1a693061bac037f46754199440",
 "prepare-guide-persistent-pro.cjs":"ab209cdc940908d1f032562e281b47d0e68bfc98c781044a64608aa867d325e9",
 "check-pro-entitlement.cjs":"41953a0cdf01d0ac0d28dc4f56c46848177277a2e24bf0143e71eba5f38c7469",
 "report-guide-conversations.cjs":"2b2745f705fe728ca0544c369d18ddf2e7bfc36da9247aa523628e1e26c45354",
 "stop-guide-persistent-pro.sh":"7aceee942d7e3c7dc60c0b289b127052cdb486f888ef74427f6b63b61ddb2813",
 "knowledge.json":"e905c583129737224364019aabe9a308e980e439149bfe9904f8f1b6d83e3070",
};
function verifyPrevious(){
 for(const [name,hash] of Object.entries(previousHashes)){
  const path=join(original,name),stat=lstatSync(path);assert(stat.isFile()&&[0,1000].includes(stat.uid)&&(stat.mode&0o022)===0);
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),hash);
 }
}
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
 assert.equal(process.getuid?.(),0);assert(process.argv.length===(addSecond?3:2));process.umask(0o077);
 assert.equal(run("is-active","bitcoinwalk-guide.service"),"active");assert.equal(run("is-active",unit),"active");
 for(const path of [base,original]){const s=lstatSync(path);assert(s.isDirectory()&&s.uid===0&&(s.mode&0o022)===0);}
 for(const pilot of ["bitcoinwalk-guide-test1-pilot.service","bitcoinwalk-guide-pro-pilot.service"])
  assert.equal(run("show",pilot,"--property=ActiveState","--value"),"inactive");
 assert(lstatSync(base+"/current").isSymbolicLink());assert.equal(lstatSync(base+"/current").uid,0);
 assert.equal(realpathSync(base+"/current"),original);const oldTarget=readlinkSync(base+"/current");
 stage="installed-release";
 if(addSecond)verifyPrevious();else rootFile(original+"/SOURCE_COMMIT");
 assert.equal(readFileSync(original+"/SOURCE_COMMIT","utf8").trim(),addSecond?"b2556250efea3b26418178a1713a6fac96fe7910":"1a3699186e19e5900a69a4d6477be43394904aa8");
 stage="policy";
 rootFile(policyPath);const raw=readFileSync(policyPath,"utf8");
 assert.equal(createHash("sha256").update(raw).digest("hex"),addSecond?"3ad76e5e964d15a052ea5cc4d9c9058c9d345c373663ce0019aeb323bcb577d4":"f365ac5b37a0c58543c4e0706fdcd425a3c405e734206d5f75565d06e91b8de8");
 const now=Math.floor(Date.now()/1000),next=addSecond?twoProUpgradePolicy(JSON.parse(raw),now):reviewedUpgradePolicy(JSON.parse(raw),now);
 stage="state-identity";
 const config=JSON.parse(readFileSync("/etc/bitcoinwalk-guide/config.json","utf8"));
 assert.equal(config.proSetupStatusURL,"http://127.0.0.1:3345/api/pro-setup-notifications");assert.equal(config.support.enabled,true);
 const state=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});
 try{assert.equal((state.prepare("SELECT value FROM meta WHERE key='identity'").get() as {value:string}).value,JSON.stringify(["9bb58bb2727e98e2008e3385ebfaa512caac9b99daacfc3d0392523d75b34d3c",config.sourceRelay]));}finally{state.close();}
 stage="credential-permissions";
 const key=rootFile("/etc/bitcoinwalk-guide/persistent-pro-openai-key");assert.equal(key.mode&0o777,0o600);
 stage="knowledge-and-unit";
 assert.equal(loadGuideKnowledge(join(folder,"knowledge.json")).sha256,next.knowledgeSha256);
 assert.deepEqual(readFileSync(join(folder,"knowledge.json")),readFileSync(original+"/knowledge.json"));
 assert.deepEqual(readFileSync(join(folder,"bitcoinwalk-guide-auto-pro.service")),readFileSync("/etc/systemd/system/"+unit));
 for(const recipient of addSecond?[next.recipient,GUIDE_SECOND_PRO_RECIPIENT]:[next.recipient]){
  stage=recipient===GUIDE_SECOND_PRO_RECIPIENT?"second-pro-entitlement":"original-pro-entitlement";
  const checked=JSON.parse(execFileSync(process.execPath,[join(folder,"check-pro-entitlement.cjs"),nip19.npubEncode(recipient)],{encoding:"utf8",timeout:15000,env:{...process.env,GUIDE_CONFIG:"/etc/bitcoinwalk-guide/config.json",CREDENTIALS_DIRECTORY:"/etc/bitcoinwalk-guide"}}));
  assert.equal(checked.recipient,recipient);assert.equal(checked.proVerified,true);assert.equal(checked.plan,"pro");
 }
 stage="install-files";
 // Repair only exact known release files; never relax ownership for arbitrary code.
 if(addSecond){verifyPrevious();for(const name of Object.keys(previousHashes))chownSync(join(original,name),0,0);verifyPrevious();}
 const commit=readFileSync(join(folder,"SOURCE_COMMIT"),"utf8").trim();assert(/^[a-f0-9]{40}$/.test(commit));
 const target=base+"/releases/"+commit;mkdirSync(base+"/releases",{recursive:true,mode:0o755});chmodSync(base+"/releases",0o755);mkdirSync(target,{mode:0o755});chmodSync(target,0o755);
 for(const name of ["run-guide-persistent-pro.cjs","prepare-guide-persistent-pro.cjs","check-pro-entitlement.cjs","report-guide-conversations.cjs","stop-guide-persistent-pro.sh","knowledge.json","SOURCE_COMMIT"]){
  installGuideRootFile(join(folder,name),join(target,name),name.endsWith(".cjs")||name.endsWith(".sh")?0o755:0o644);rootFile(join(target,name));
 }
 stage="backup";
 const backup=mkdtempSync("/var/backups/bitcoinwalk-guide-reviewed-upgrade.");
 writeFileSync(join(backup,"policy.json"),raw,{flag:"wx",mode:0o600});writeFileSync(join(backup,"previous-target"),oldTarget,{flag:"wx",mode:0o600});
 let stopped=false,changed=false;
 try{
  stage="stop-and-backup-state";
  run("stop",unit);stopped=true;assert.equal(readFileSync(policyPath,"utf8"),raw);assert.equal(realpathSync(base+"/current"),original);
  const before=snapshot();writeFileSync(join(backup,"counters.json"),JSON.stringify(before)+"\n",{flag:"wx",mode:0o600});
  const db=new DatabaseSync("/var/lib/bitcoinwalk-guide/guide.sqlite",{readOnly:true});try{db.exec("PRAGMA busy_timeout=5000");db.prepare("VACUUM INTO ?").run(join(backup,"guide.sqlite"));}finally{db.close();}
  // The new account is admitted only to messages sent after this activation.
  const activated=addSecond?twoProUpgradePolicy(JSON.parse(raw),Math.floor(Date.now()/1000)):next;
  stage="activate";changed=true;atomicPolicy(JSON.stringify(activated)+"\n");point(target);
  assert.deepEqual(snapshot(),before);
  stage="start";run("start",unit);await new Promise(resolve=>setTimeout(resolve,5000));assert.equal(run("is-active",unit),"active");
  console.log(JSON.stringify({result:addSecond?"GUIDE_SECOND_PRO_ACTIVATED":"GUIDE_REVIEWED_QUESTIONS_UPGRADED",backup,recipient:next.recipient,...(addSecond?{additionalRecipient:GUIDE_SECOND_PRO_RECIPIENT,maxCallsPerAccountPerUtcDay:10,maxRepliesPerAccountPerUtcDay:5}:{}),startsAt:next.startsAt,quotaReset:false,keyChanged:false,leaderboard:"admin-only",initialHistory:"retained-messages-only"}));
 }catch{
  if(changed){run("stop",unit);atomicPolicy(raw);point(oldTarget);}
  if(stopped)run("start",unit);
  throw new Error("Upgrade failed; original worker restored without restoring or resetting the database.");
 }
}
main().catch(()=>{console.error(`Reviewed Guide upgrade failed at ${stage}. Check service status and upgrade backup; no secret values logged.`);process.exitCode=1;});
