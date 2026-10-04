// Capture actual Figma reference exports; never publish or approximate missing art.
// FIGMA_ACCESS_TOKEN is read from the environment, never from command-line args.
// Usage: node scripts/capture-figma-logo-source.mjs /absolute/new/bundle-directory
import {mkdir, mkdtemp, writeFile, rename, lstat} from "node:fs/promises";
import {dirname, join, isAbsolute} from "node:path";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {inspectCityTemplate,safeExportUrl} from "../src/logos/figma-source.ts";

const file="4Plc48s7zBJXhx2aG9lKHv",node="2001:157",destination=process.argv[2];
const token=process.env.FIGMA_ACCESS_TOKEN?.trim();
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
async function bounded(response,maxBytes){
  if(!response.ok)throw new Error(`Figma source request failed (HTTP ${response.status})`);
  if(Number(response.headers.get("content-length"))>maxBytes)throw new Error("Figma response too large");
  const reader=response.body?.getReader();if(!reader)throw new Error("Empty response");
  const parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error("Figma response too large");parts.push(Buffer.from(value));}}finally{await reader.cancel();}
  return Buffer.concat(parts);
}
async function api(path){
  const response=await fetch(`https://api.figma.com/v1/${path}`,{headers:{"X-Figma-Token":token},redirect:"error",signal:AbortSignal.timeout(45000)});
  return JSON.parse((await bounded(response,8*1024*1024)).toString("utf8"));
}
async function main(){
  if(!token)throw new Error("Configure FIGMA_ACCESS_TOKEN privately with file_content:read access");
  if(!destination || !isAbsolute(destination))throw new Error("Supply an absolute new output directory");
  if(await lstat(destination).catch(()=>null))throw new Error("Output already exists; source bundles are immutable");
  const source=await api(`files/${file}/nodes?ids=${encodeURIComponent(node)}`);
  if(typeof source.version!=="string")throw new Error("Source version missing");
  const document=source.nodes?.[node]?.document;
  const variants=inspectCityTemplate(document,"WARSZAWA");
  const images=await api(`images/${file}?ids=${encodeURIComponent(variants.map(item=>item.id).join(","))}&format=png&scale=1&version=${encodeURIComponent(source.version)}`);
  await mkdir(dirname(destination),{recursive:true});
  const staging=await mkdtemp(join(dirname(destination),".figma-capture-"));
  const outputs=[];
  for(const variant of variants){
    const url=images.images?.[variant.id];if(typeof url!=="string")throw new Error("Missing Figma variant export");
    // Never send the API credential to image storage, follow redirects or log URLs.
    const bytes=await bounded(await fetch(safeExportUrl(url),{redirect:"error",signal:AbortSignal.timeout(45000)}),20*1024*1024);
    const metadata=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
    if(metadata.format!=="png" || !metadata.hasAlpha)throw new Error("Expected transparent PNG reference");
    const name=`warszawa${variant.name}.png`;
    await writeFile(join(staging,name),bytes,{mode:0o600});
    outputs.push({name,sha256:digest(bytes),width:metadata.width,height:metadata.height});
  }
  const json=JSON.stringify(document,null,2)+"\n";
  await writeFile(join(staging,"source-node.json"),json,{mode:0o600});
  await writeFile(join(staging,"capture.json"),JSON.stringify({schema:1,file,node,version:source.version,sourceSha256:digest(json),variants,outputs,reviewRequired:true},null,2)+"\n",{mode:0o600});
  await rename(staging,destination);
  console.log(`Captured ${outputs.length} actual Warszawa reference exports. Template extraction and visual approval are still required.`);
}
main().catch(error=>{
  // Avoid echoing transport errors, tokens or signed download URLs.
  const known=/^(Configure |Supply |Output |Source |Expected |Each |Unexpected |Template |Figma |Missing |Untrusted )/;
  console.error(known.test(error.message)?error.message:"Figma capture failed; retained staging evidence is not published.");
  process.exitCode=1;
});
