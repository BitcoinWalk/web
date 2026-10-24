import {mkdtempSync,copyFileSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const root=resolve(import.meta.dirname,".."),temporary=mkdtempSync(join(tmpdir(),"bitcoinwalk-sponsor-order-package-"));
const sha=value=>createHash("sha256").update(value).digest("hex");
try{
 copyFileSync(join(root,"release-build/sponsor-payout-order.cjs"),join(temporary,"sponsor-payout-order.cjs"));
 copyFileSync(join(root,"docs/sponsor-host-payout-operations.md"),join(temporary,"OPERATIONS.md"));
 writeFileSync(join(temporary,"SHA256SUMS"),["sponsor-payout-order.cjs","OPERATIONS.md"].map(name=>`${sha(readFileSync(join(temporary,name)))}  ${name}\n`).join(""));
 const archive=execFileSync("tar",["--sort=name","--mtime=1980-01-01 UTC","--owner=0","--group=0","--numeric-owner","-C",temporary,"-cf","-","."],{maxBuffer:8*1024*1024});
 const compressed=execFileSync("gzip",["-n"],{input:archive,maxBuffer:8*1024*1024});
 const target=join(root,"release-build/bitcoinwalk-sponsor-payout-order-0.1.3.tar.gz");writeFileSync(target,compressed,{mode:0o600});
 writeFileSync(`${target}.sha256`,`${sha(compressed)}  bitcoinwalk-sponsor-payout-order-0.1.3.tar.gz\n`,{mode:0o600});
 console.log(`Prepared disabled-by-default single-order runner: ${target}\nSHA-256: ${sha(compressed)}`);
}finally{rmSync(temporary,{recursive:true,force:true});}
