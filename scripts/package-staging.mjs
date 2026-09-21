import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const standalone=join(root,".next","standalone");
const staticAssets=join(root,".next","static");
const publicAssets=join(root,"public");
const output=join(root,"release-build");

async function requirePath(path,kind){
  const entry=await lstat(path).catch(()=>null);
  if(!entry || kind==="file"&&!entry.isFile() || kind==="directory"&&!entry.isDirectory()){
    throw new Error(`Missing ${kind}: ${path}. Run npm run build first.`);
  }
}

async function rejectPrivateFiles(path){
  for(const entry of await readdir(path,{withFileTypes:true})){
    if(entry.name==="node_modules")continue;
    if(/^\.env(?:\..*)?$|^\.npmrc$|\.sqlite(?:-shm|-wal)?$|\.(?:pem|p12|key)$/.test(entry.name)){
      throw new Error(`Unexpected private file in release: ${join(path,entry.name)}`);
    }
    if(entry.isDirectory())await rejectPrivateFiles(join(path,entry.name));
  }
}

const health=await readFile(join(root,"src","app","api","healthz","route.ts"),"utf8");
const release=health.match(/release:\s*["'](app-staging-\d+\.\d+\.\d+)["']/)?.[1];
if(!release)throw new Error("Set an app-staging-X.Y.Z release label in src/app/api/healthz/route.ts.");
await requirePath(standalone,"directory");
await requirePath(staticAssets,"directory");
await requirePath(join(root,".next","BUILD_ID"),"file");
await requirePath(join(standalone,".next","BUILD_ID"),"file");
const buildId=(await readFile(join(root,".next","BUILD_ID"),"utf8")).trim();
const standaloneBuildId=(await readFile(join(standalone,".next","BUILD_ID"),"utf8")).trim();
if(!buildId || buildId!==standaloneBuildId)throw new Error("Standalone and static build IDs differ. Run npm run build again.");
await requirePath(join(staticAssets,buildId),"directory");

await mkdir(output,{recursive:true});
const temp=await mkdtemp(join(output,".staging-"));
try{
  const stage=join(temp,"package");
  await cp(standalone,stage,{recursive:true});
  await cp(staticAssets,join(stage,".next","static"),{recursive:true});
  if((await lstat(publicAssets).catch(()=>null))?.isDirectory())await cp(publicAssets,join(stage,"public"),{recursive:true});

  for(const file of ["server.js","package.json",".next/BUILD_ID"]){
    await requirePath(join(stage,file),"file");
  }
  for(const directory of ["node_modules",".next/server",".next/static"]){
    await requirePath(join(stage,directory),"directory");
  }
  if(!(await readdir(join(stage,".next","static"))).length)throw new Error("Release static assets are empty.");
  await rejectPrivateFiles(stage);

  const archive=join(output,`${release}.tar.gz`);
  const temporaryArchive=join(temp,basename(archive));
  execFileSync("tar",["-czf",temporaryArchive,"-C",stage,"."],{stdio:"inherit"});
  execFileSync("tar",["-tzf",temporaryArchive],{stdio:"ignore"});
  const digest=createHash("sha256").update(await readFile(temporaryArchive)).digest("hex");
  await rename(temporaryArchive,archive);
  await writeFile(`${archive}.sha256`,`${digest}  ${basename(archive)}\n`);
  process.stdout.write(`Packaged ${archive}\nSHA-256 ${digest}\n`);
}finally{
  await rm(temp,{recursive:true,force:true});
}
