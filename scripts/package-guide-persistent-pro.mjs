import {execFileSync} from "node:child_process";
import {readFile,writeFile,mkdir,copyFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join,resolve} from "node:path";

const git=(...args)=>execFileSync("git",args,{encoding:"utf8"}).trim();
if(git("status","--porcelain","--untracked-files=no"))throw new Error("Commit tracked changes before packaging.");
const commit=git("rev-parse","HEAD"),folder=resolve("release-build",`bw152-persistent-pro-${commit.slice(0,7)}`);
const knowledgePath=process.argv[2];if(!knowledgePath)throw new Error("Provide the reviewed knowledge snapshot path.");
const policy=JSON.parse(await readFile("deploy/guide/persistent-pro-disabled.json","utf8")),knowledge=JSON.parse(await readFile(knowledgePath,"utf8"));
const digest=value=>createHash("sha256").update(value).digest("hex");
if(knowledge.sha256!==policy.knowledgeSha256||digest(JSON.stringify({version:knowledge.version,documents:knowledge.documents}))!==policy.knowledgeSha256)throw new Error("Knowledge differs from the reviewed snapshot.");
await mkdir(folder,{recursive:true});
const files=[
 ["release-build/persistent-pro/run-guide-persistent-pro.cjs","run-guide-persistent-pro.cjs"],
 ["release-build/persistent-pro/prepare-guide-persistent-pro.cjs","prepare-guide-persistent-pro.cjs"],
 ["release-build/persistent-pro/check-guide-persistent-pro.cjs","check-guide-persistent-pro.cjs"],
 ["release-build/persistent-pro/check-guide-selected-pro.cjs","check-pro-entitlement.cjs"],
 ["deploy/install-guide-persistent-pro.sh","install-guide-persistent-pro.sh"],
 ["deploy/stop-guide-persistent-pro.sh","stop-guide-persistent-pro.sh"],
 ["deploy/guide/bitcoinwalk-guide-auto-pro.service","bitcoinwalk-guide-auto-pro.service"],
 ["deploy/guide/persistent-pro-disabled.json","persistent-pro-disabled.json"],
 [knowledgePath,"knowledge.json"],
];
for(const [source,name] of files)await copyFile(source,join(folder,name));
await writeFile(join(folder,"SOURCE_COMMIT"),commit+"\n");
const names=[...files.map(([,name])=>name),"SOURCE_COMMIT"].sort(),lines=[];
for(const name of names)lines.push(`${digest(await readFile(join(folder,name)))}  ${name}`);
await writeFile(join(folder,"SHA256SUMS"),lines.join("\n")+"\n");
console.log(`Packaged ${folder}. No credential installed, service enabled, model called or message sent.`);
