import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {copyFileSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";

const root=resolve(import.meta.dirname,".."),temporary=mkdtempSync(join(tmpdir(),"bitcoinwalk-city-revision-automation-"));
const sha=value=>createHash("sha256").update(value).digest("hex");
try{
 const worker=readFileSync(join(root,"release-build/city-revision-automation.cjs")),source=worker.toString("utf8");
 for(const forbidden of ["BITCOINWALK_NWC_URL","class NwcWallet","rustress-payout"]){if(source.includes(forbidden))throw new Error(`Automation bundle contains forbidden payment runtime: ${forbidden}`);}
 writeFileSync(join(temporary,"city-revision-automation.cjs"),worker,{mode:0o600});
 for(const name of ["install-disabled.sh","check-staging.sh"])copyFileSync(join(root,"deploy/city-revision-automation",name),join(temporary,name));
 copyFileSync(join(root,"docs/city-revision-automation-operations.md"),join(temporary,"OPERATIONS.md"));
 const names=["city-revision-automation.cjs","install-disabled.sh","check-staging.sh","OPERATIONS.md"];
 writeFileSync(join(temporary,"SHA256SUMS"),names.map(name=>`${sha(readFileSync(join(temporary,name)))}  ${name}\n`).join(""),{mode:0o600});
 const archive=execFileSync("tar",["--sort=name","--mtime=1980-01-01 UTC","--owner=0","--group=0","--numeric-owner","-C",temporary,"-cf","-","."],{maxBuffer:16*1024*1024});
 const compressed=execFileSync("gzip",["-n"],{input:archive,maxBuffer:16*1024*1024}),target=join(root,"release-build/bitcoinwalk-city-revision-automation-0.1.0.tar.gz");
 writeFileSync(target,compressed,{mode:0o600});writeFileSync(`${target}.sha256`,`${sha(compressed)}  bitcoinwalk-city-revision-automation-0.1.0.tar.gz\n`,{mode:0o600});
 console.log(`Prepared disabled city revision automation package: ${target}\nSHA-256: ${sha(compressed)}`);
}finally{rmSync(temporary,{recursive:true,force:true});}
