import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {copyFileSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";

const root=resolve(import.meta.dirname,".."),temporary=mkdtempSync(join(tmpdir(),"bitcoinwalk-city-brand-automation-"));
const sha=value=>createHash("sha256").update(value).digest("hex");
try{
 const worker=readFileSync(join(root,"release-build/city-brand-automation.cjs"));
 const source=worker.toString("utf8");
 for(const forbidden of ["BITCOINWALK_NWC_URL","Payment reconciliation deferred","class NwcWallet","sharp/dist"]){if(source.includes(forbidden))throw new Error(`Automation bundle contains forbidden runtime: ${forbidden}`);}
 writeFileSync(join(temporary,"city-brand-automation.cjs"),worker,{mode:0o600});
 copyFileSync(join(root,"docs/city-brand-automation-operations.md"),join(temporary,"OPERATIONS.md"));
 const names=["city-brand-automation.cjs","OPERATIONS.md"];
 writeFileSync(join(temporary,"SHA256SUMS"),names.map(name=>`${sha(readFileSync(join(temporary,name)))}  ${name}\n`).join(""),{mode:0o600});
 const archive=execFileSync("tar",["--sort=name","--mtime=1980-01-01 UTC","--owner=0","--group=0","--numeric-owner","-C",temporary,"-cf","-","."],{maxBuffer:8*1024*1024});
 const compressed=execFileSync("gzip",["-n"],{input:archive,maxBuffer:8*1024*1024});
 const target=join(root,"release-build/bitcoinwalk-city-brand-automation-0.1.0.tar.gz");
 writeFileSync(target,compressed,{mode:0o600});writeFileSync(`${target}.sha256`,`${sha(compressed)}  bitcoinwalk-city-brand-automation-0.1.0.tar.gz\n`,{mode:0o600});
 console.log(`Prepared disabled city identity automation package: ${target}\nSHA-256: ${sha(compressed)}`);
}finally{rmSync(temporary,{recursive:true,force:true});}
