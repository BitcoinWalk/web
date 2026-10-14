import {readFile,readdir,lstat} from "node:fs/promises";
import {dirname,join,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const contentRoot=join(root,"src/content/docs");
const manifest=JSON.parse(await readFile(join(root,"public-content.json"),"utf8"));
if(manifest.version!==1||!Array.isArray(manifest.files)||!manifest.files.length)throw new Error("Invalid public documentation allowlist.");
const allowed=new Set(manifest.files);
if(allowed.size!==manifest.files.length)throw new Error("Duplicate public documentation allowlist entry.");
const discovered=[];
async function walk(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name),stat=await lstat(path);
    if(stat.isSymbolicLink())throw new Error(`Public documentation must not contain symlinks: ${path}`);
    if(entry.isDirectory())await walk(path);
    else if(/\.mdx?$/.test(entry.name))discovered.push(relative(contentRoot,path).split(sep).join("/"));
  }
}
await walk(contentRoot);
for(const file of discovered)if(!allowed.has(file))throw new Error(`Public documentation is not allowlisted: ${file}`);
for(const file of allowed)if(!discovered.includes(file))throw new Error(`Allowlisted public documentation is missing: ${file}`);
const forbidden=[
  [/\/(?:home|var|etc)\/bitcoinwalk\b/i,"private server path"],
  [/\b(?:127\.0\.0\.1|213\.232\.235\.)/i,"internal host or address"],
  [/\b(?:sudo|ssh)\s+/i,"operator command"],
  [/\b(?:nsec1|private key|recovery key|credential file)\b/i,"private credential material"],
  [/\/var\/backups\//i,"private backup path"]
];
for(const file of allowed){
  const body=await readFile(join(contentRoot,file),"utf8");
  for(const [pattern,label] of forbidden)if(pattern.test(body))throw new Error(`${file} contains a forbidden ${label}.`);
}
console.log(`Public documentation allowlist accepted: ${allowed.size} pages.`);
