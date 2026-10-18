import {afterEach,describe,expect,it} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"bw-deploy-test-"));roots.push(root);
 const releases=join(root,"releases"),previous=join(releases,"0.3.444-prior"),current=join(root,"current"),input=join(root,"input");
 mkdirSync(previous,{recursive:true});mkdirSync(input);symlinkSync(previous,current);
 const sourceCommit="a".repeat(40),oldCommit="b".repeat(40);
 const manifest={schema:1,profile:"production",release:"app-production-0.3.445",sourceCommit,ancestors:[sourceCommit,oldCommit],buildId:sourceCommit};
 writeFileSync(join(previous,"release-manifest.json"),JSON.stringify({...manifest,sourceCommit:oldCommit}));
 function pack(){
  writeFileSync(join(input,"release-manifest.json"),JSON.stringify(manifest));
  const archive=join(root,"app-production-0.3.445.tar.gz");
  expect(spawnSync("tar",["-czf",archive,"-C",input,"."]).status).toBe(0);
  const digest=createHash("sha256").update(readFileSync(archive)).digest("hex");
  writeFileSync(`${archive}.sha256`,`${digest}  app-production-0.3.445.tar.gz\n`);return archive;
 }
 const env={...process.env,releases,current,runtime:process.execPath,profile:"production",release:"0.3.445",expected_current:previous,archive:pack()};
 const guard=resolve("deploy/app-deploy-guard.sh");
 const run=(before="",after="")=>spawnSync("bash",["-c",`${before}\nsource "$1"; app_deploy_guard || exit $?; ${after||":"}`,"guard",guard],{env,encoding:"utf8"});
 return {root,releases,previous,current,manifest,pack,env,run};
}
describe("deployment safeguards",()=>{
 it("accepts descendant source and allows identical artifact retries",()=>{const f=fixture();expect(f.run().status).toBe(0);expect(f.run().status).toBe(0);});
 it("refuses another deployment holding the lock",()=>{const f=fixture();const r=f.run('exec 8>"$releases/.deploy.lock"; flock -n 8');expect(r.status).not.toBe(0);expect(r.stderr).toContain("in progress");});
 it("refuses a stale expected-current without changing the active release",()=>{const f=fixture();f.env.expected_current="/stale";const r=f.run();expect(r.status).not.toBe(0);expect(r.stderr).toContain("Active release changed");});
 it("rejects version reuse against legacy release directories",()=>{const f=fixture();mkdirSync(join(f.releases,"0.3.445-different"));expect(f.run().stderr).toContain("already exists");});
 it("rejects version reuse even before successful activation",()=>{const f=fixture();expect(f.run().status).toBe(0);f.manifest.buildId="changed";f.pack();expect(f.run().stderr).toContain("reserved");});
 it("rejects a branch omitting the active source",()=>{const f=fixture();f.manifest.ancestors=[f.manifest.sourceCommit];f.pack();expect(f.run().stderr).toContain("omits the active");});
 it("rejects an artifact for the wrong environment",()=>{const f=fixture();f.manifest.profile="staging";f.pack();expect(f.run().stderr).toContain("Invalid release provenance");});
 it("rejects a corrupted upload",()=>{const f=fixture();writeFileSync(f.env.archive,"bad");expect(f.run().stderr).toContain("checksum mismatch");});
 it("activates a private snapshot, not the mutable upload",()=>{const f=fixture();const r=f.run("",'test "$archive" != "'+f.env.archive+'" && test -f "$archive"');expect(r.status).toBe(0);});
 it("fails closed without the expected-current argument",()=>{const f=fixture();f.env.expected_current="";expect(f.run().status).not.toBe(0);});
});
