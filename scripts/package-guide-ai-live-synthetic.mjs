import {chmodSync,cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";

const root=resolve("release-build/bw152-guide-ai-live-synthetic"),files=["check-guide-ai-live-synthetic.cjs","knowledge.json","install-guide-ai-live-synthetic-check.sh"];
rmSync(root,{recursive:true,force:true});mkdirSync(root,{recursive:true,mode:0o700});
cpSync("release-build/check-guide-ai-live-synthetic.cjs",resolve(root,"check-guide-ai-live-synthetic.cjs"));cpSync("guide-build/knowledge.json",resolve(root,"knowledge.json"));cpSync("deploy/install-guide-ai-live-synthetic-check.sh",resolve(root,"install-guide-ai-live-synthetic-check.sh"));
for(const name of files)chmodSync(resolve(root,name),name.endsWith(".json")?0o600:0o755);const sums=files.map(name=>`${createHash("sha256").update(readFileSync(resolve(root,name))).digest("hex")}  ${name}`).join("\n")+"\n";writeFileSync(resolve(root,"SHA256SUMS"),sums,{mode:0o600});console.log(root);
