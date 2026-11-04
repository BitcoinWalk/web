import {chmodSync,cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";

const root=resolve("release-build/bw152-guide-evaluation"),files=["guide.cjs","check-guide-ai-evaluation.cjs","install-guide-evaluation.sh"];
rmSync(root,{recursive:true,force:true});mkdirSync(root,{recursive:true,mode:0o700});
cpSync("guide-build/guide.cjs",resolve(root,"guide.cjs"));cpSync("release-build/check-guide-ai-evaluation.cjs",resolve(root,"check-guide-ai-evaluation.cjs"));cpSync("deploy/install-guide-evaluation.sh",resolve(root,"install-guide-evaluation.sh"));
for(const name of files)chmodSync(resolve(root,name),0o755);
writeFileSync(resolve(root,"SHA256SUMS"),files.map(name=>`${createHash("sha256").update(readFileSync(resolve(root,name))).digest("hex")}  ${name}`).join("\n")+"\n",{mode:0o600});console.log(root);
