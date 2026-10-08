import {build} from "esbuild";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,mkdtemp,cp,readFile,writeFile,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const output=resolve(root,"release-build");
const version="bitcoinwalk-remote-journal-0.1.0";
await mkdir(output,{recursive:true});
const temporary=await mkdtemp(join(output,".remote-journal-"));
try{
 const stage=join(temporary,version);await mkdir(stage);
 await build({entryPoints:[join(root,"src/rustress/remote-journal-service.ts")],outfile:join(stage,"journal.cjs"),bundle:true,platform:"node",target:"node24",format:"cjs",legalComments:"eof"});
 await cp(join(root,"deploy/remote-journal.service.example"),join(stage,"remote-journal.service.example"));
 await cp(join(root,"docs/rustress-payout-ledger.md"),join(stage,"OPERATIONS.md"));
 const archive=join(output,`${version}.tar.gz`);
 execFileSync("tar",["--sort=name","--mtime=1980-01-01 UTC","--owner=0","--group=0","--numeric-owner","-czf",archive,"-C",temporary,version]);
 const digest=createHash("sha256").update(await readFile(archive)).digest("hex");
 await writeFile(`${archive}.sha256`,`${digest}  ${version}.tar.gz\n`);
 console.log(archive);
}finally{await rm(temporary,{recursive:true,force:true});}
