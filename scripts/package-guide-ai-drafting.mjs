import {chmodSync,cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";

const root=resolve("release-build/bw152-guide-ai-disabled"),files=["guide.cjs","knowledge.json","check-guide-ai-drafting-disabled.cjs","install-guide-ai-drafting-disabled.sh"];
rmSync(root,{recursive:true,force:true});mkdirSync(root,{recursive:true,mode:0o700});
cpSync("guide-build/guide.cjs",resolve(root,"guide.cjs"));cpSync("guide-build/knowledge.json",resolve(root,"knowledge.json"));cpSync("release-build/check-guide-ai-drafting-disabled.cjs",resolve(root,"check-guide-ai-drafting-disabled.cjs"));cpSync("deploy/install-guide-ai-drafting-disabled.sh",resolve(root,"install-guide-ai-drafting-disabled.sh"));
for(const name of files)chmodSync(resolve(root,name),name.endsWith(".sh")||name.endsWith(".cjs")?0o755:0o600);const sums=files.map(name=>`${createHash("sha256").update(readFileSync(resolve(root,name))).digest("hex")}  ${name}`).join("\n")+"\n";writeFileSync(resolve(root,"SHA256SUMS"),sums,{mode:0o600});console.log(root);
