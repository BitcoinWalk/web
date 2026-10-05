import {mkdir, readFile, writeFile, rename, unlink, readdir} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {normalizeSponsorLogo} from "./sponsor-logo";

const root = () => join(process.env.BITCOINWALK_MEDIA_ROOT || join(process.env.TMPDIR || "/tmp", "bitcoinwalk-media"), "sponsor-pending");
let active = 0;
const processing=new Set<string>();
const assetRoot=()=>join(root(),"..","sponsor-assets");
const hashOf=(body:Buffer)=>createHash("sha256").update(body).digest("hex");

/** Private inventory. Approval is derived from signed assignments, never this manifest. */
export async function listSponsorLogoUploads(){
 const result:{cityId:string;sponsorPubkey:string;hash:string;uploadedAt:number}[]=[];
 const cities=await readdir(root(),{withFileTypes:true}).catch(()=>[]);
 for(const city of cities){
  if(!city.isDirectory()||!/^[a-f0-9-]{36}$/.test(city.name))continue;
  for(const sponsor of await readdir(join(root(),city.name),{withFileTypes:true})){
   if(!sponsor.isDirectory()||!/^[a-f0-9]{64}$/.test(sponsor.name))continue;
   try{const record=JSON.parse(await readFile(join(root(),city.name,sponsor.name,"pending.json"),"utf8"));
    if(record.cityId===city.name&&record.sponsorPubkey===sponsor.name&&/^[a-f0-9]{64}$/.test(record.hash)&&Number.isFinite(record.uploadedAt))result.push({cityId:city.name,sponsorPubkey:sponsor.name,hash:record.hash,uploadedAt:record.uploadedAt});
   }catch{/* Incomplete/corrupt uploads are not inventory entries. */}
  }
 }
 return result.sort((a,b)=>b.uploadedAt-a.uploadedAt);
}
/** Admin-only read: no staging, publication, or approval side effects. */
export async function previewSponsorLogo(input:{cityId:string;sponsorPubkey:string;hash:string}){
 if(!/^[a-f0-9-]{36}$/.test(input.cityId)||![/^[a-f0-9]{64}$/.test(input.sponsorPubkey),/^[a-f0-9]{64}$/.test(input.hash)].every(Boolean))throw new Error("Invalid asset identity.");
 let body=await readSponsorLogoAsset(input.hash);
 if(!body){
  const directory=join(root(),input.cityId,input.sponsorPubkey);
  const record=JSON.parse(await readFile(join(directory,"pending.json"),"utf8"));
  if(record.cityId!==input.cityId||record.sponsorPubkey!==input.sponsorPubkey||record.hash!==input.hash)throw new Error("Upload changed; refresh assets.");
  body=await readFile(join(directory,"logo.png"));
 }
 if(hashOf(body)!==input.hash)throw new Error("Asset integrity check failed.");
 return {hash:input.hash,base64:body.toString("base64")};
}

/** Only the admin review API calls this. Staging is private, not approval. */
export async function reviewPendingSponsorLogo(cityId:string,sponsorPubkey:string){
  if(!/^[a-f0-9-]{36}$/.test(cityId)||!/^[a-f0-9]{64}$/.test(sponsorPubkey))throw new Error("Invalid identity.");
  const directory=join(root(),cityId,sponsorPubkey);
  const record=JSON.parse(await readFile(join(directory,"pending.json"),"utf8"));
  const body=await readFile(join(directory,"logo.png"));
  if(record.cityId!==cityId||record.sponsorPubkey!==sponsorPubkey||record.hash!==hashOf(body))throw new Error("Pending logo changed; reload it before review.");
  await mkdir(assetRoot(),{recursive:true,mode:0o700});
  const file=join(assetRoot(),record.hash+".png"),temp=file+`.${randomUUID()}.tmp`;
  try{await writeFile(temp,body,{mode:0o600});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
  return {hash:record.hash as string,base64:body.toString("base64"),actor:record.actor as string,uploadedAt:record.uploadedAt as number};
}
/** Caller must resolve a current, signed admin assignment before using this. */
export async function readSponsorLogoAsset(hash:string):Promise<Buffer|null>{
  if(!/^[a-f0-9]{64}$/.test(hash))return null;
  try{const body=await readFile(join(assetRoot(),hash+".png"));return hashOf(body)===hash?body:null;}catch{return null;}
}
// Assets stay private until a later signed approval/assignment references them.
export async function storePendingSponsorLogo(input: {bytes:Buffer;mime:string;cityId:string;sponsorPubkey:string;actor:string;signedRequestId:string}) {
  if (!/^[0-9a-f-]{36}$/.test(input.cityId) || ![input.sponsorPubkey,input.actor,input.signedRequestId].every(value=>/^[a-f0-9]{64}$/.test(value))) throw new Error("Invalid asset identity.");
  const key=`${input.cityId}:${input.sponsorPubkey}`;
  if (active >= 2 || processing.has(key)) throw new Error("Logo processing is busy. Try again shortly.");
  active++;
  processing.add(key);
  try {
    const directory = join(root(),input.cityId,input.sponsorPubkey);
    await mkdir(directory,{recursive:true,mode:0o700});
    const manifest = join(directory,"pending.json");
    let previous: {hash?:string;uploadedAt?:number;originalHash?:string}|undefined;
    try {previous=JSON.parse(await readFile(manifest,"utf8"));}catch{}
    // One pending image per assignment identity, with bounded replacement rate.
    if (previous?.uploadedAt && Date.now()-previous.uploadedAt<60_000) throw new Error("Wait one minute before replacing this logo.");
    const result = await normalizeSponsorLogo(input.bytes,input.mime);
    const record = {status:"pending" as const,hash:result.hash,originalHash:result.originalHash,cityId:input.cityId,sponsorPubkey:input.sponsorPubkey,actor:input.actor,signedRequestId:input.signedRequestId,uploadedAt:Date.now()};
    // A fixed private filename bounds disk use even across repeated uploads.
    const temp=join(directory,`${randomUUID()}.tmp`);
    try {await writeFile(temp,result.body,{mode:0o600});await rename(temp,join(directory,"logo.png"));}finally{await unlink(temp).catch(()=>{});}
    const metaTemp=manifest+`.${randomUUID()}.tmp`;
    try {await writeFile(metaTemp,JSON.stringify(record),{mode:0o600});await rename(metaTemp,manifest);}finally{await unlink(metaTemp).catch(()=>{});}
    return record;
  } finally {active--;processing.delete(key);}
}
