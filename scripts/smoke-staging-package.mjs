import {spawn, execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createServer} from "node:net";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {join, resolve, dirname, basename} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const output=join(root,"release-build");
const health=await readFile(join(root,"src","app","api","healthz","route.ts"),"utf8");
const release=health.match(/release:\s*["'](app-staging-\d+\.\d+\.\d+)["']/)?.[1];
if(!release)throw new Error("Set an app-staging-X.Y.Z release label in src/app/api/healthz/route.ts.");

const archive=join(output,`${release}.tar.gz`);
const checksum=(await readFile(`${archive}.sha256`,"utf8")).trim();
const digest=createHash("sha256").update(await readFile(archive)).digest("hex");
if(checksum!==`${digest}  ${basename(archive)}`)throw new Error(`SHA-256 mismatch for ${archive}`);

async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

async function firstStaticFile(directory,prefix=""){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=join(prefix,entry.name);
    if(entry.isFile())return relative;
    if(entry.isDirectory()){
      const nested=await firstStaticFile(join(directory,entry.name),relative);
      if(nested)return nested;
    }
  }
  return null;
}

const temp=await mkdtemp(join(output,".smoke-"));
let child;
try{
  execFileSync("tar",["-xzf",archive,"-C",temp],{stdio:"ignore"});
  const staticFile=await firstStaticFile(join(temp,".next","static"));
  if(!staticFile)throw new Error("Packaged static assets are empty.");
  const port=await freePort();
  const base=`http://127.0.0.1:${port}`;
  let serverOutput="";
  child=spawn(process.execPath,["server.js"],{
    cwd:temp,
    env:{...process.env,NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(port),NEXT_TELEMETRY_DISABLED:"1"},
    stdio:["ignore","pipe","pipe"],
  });
  for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{
    serverOutput=(serverOutput+chunk.toString()).slice(-4000);
  });

  const deadline=Date.now()+20000;
  let response;
  while(Date.now()<deadline){
    if(child.exitCode!==null || child.signalCode!==null)throw new Error(`Packaged server exited early.\n${serverOutput}`);
    try{
      response=await fetch(`${base}/api/healthz`,{signal:AbortSignal.timeout(2000)});
      if(response.ok)break;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!response?.ok)throw new Error(`Packaged server did not become healthy.\n${serverOutput}`);
  const body=await response.json();
  if(body.status!=="ok" || body.release!==release)throw new Error(`Unexpected health response: ${JSON.stringify(body)}`);

  const staticPath=staticFile.split(/[\\/]/).map(encodeURIComponent).join("/");
  const asset=await fetch(`${base}/_next/static/${staticPath}`,{signal:AbortSignal.timeout(5000)});
  if(!asset.ok || (await asset.arrayBuffer()).byteLength===0){
    throw new Error(`Packaged static asset failed: ${staticFile} (HTTP ${asset.status})`);
  }
  process.stdout.write(`Smoke passed: ${release} health and ${staticFile}\n`);
}finally{
  if(child && child.exitCode===null && child.signalCode===null){
    child.kill("SIGTERM");
    await new Promise(resolve=>{
      const timeout=setTimeout(()=>child.kill("SIGKILL"),5000);
      child.once("exit",()=>{clearTimeout(timeout);resolve();});
    });
  }
  await rm(temp,{recursive:true,force:true});
}
