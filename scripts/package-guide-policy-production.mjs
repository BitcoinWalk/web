import {mkdirSync,copyFileSync,readFileSync,writeFileSync,chmodSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";

const revision=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const root=resolve("release-build",`bw152-policy-production-${revision.slice(0,7)}`);
// Refuse to overwrite a previously prepared immutable release.
mkdirSync(root,{mode:0o700});
const artifacts={
 "guide.cjs":"guide-build/guide.cjs",
 "send-guide-reviewed-reply.cjs":"release-build/send-guide-reviewed-reply.cjs",
 "check-guide-ai-evaluation.cjs":"release-build/check-guide-ai-evaluation.cjs",
 "knowledge.json":"guide-build/knowledge.json",
 "ROLLOUT.md":"deploy/guide-policy-production-rollout.md",
};
for(const [name,source] of Object.entries(artifacts)){
 copyFileSync(source,resolve(root,name));chmodSync(resolve(root,name),0o600);
}
writeFileSync(resolve(root,"SOURCE_COMMIT"),revision+"\n",{mode:0o600});
const names=[...Object.keys(artifacts),"SOURCE_COMMIT"];
writeFileSync(resolve(root,"SHA256SUMS"),names.map(name=>`${createHash("sha256").update(readFileSync(resolve(root,name))).digest("hex")}  ${name}`).join("\n")+"\n",{mode:0o600});
console.log(root);
