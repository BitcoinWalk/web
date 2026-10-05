import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,rename,writeFile,unlink} from "node:fs/promises";
import {join} from "node:path";
import sharp from "sharp";
import {readMedia} from "./media-store";
const VERSION="og-city-v4",WIDTH=1200,HEIGHT=630;
const digest=(body:Buffer)=>createHash("sha256").update(body).digest("hex");
const root=()=>join(process.env.BITCOINWALK_MEDIA_ROOT||join(process.env.TMPDIR||"/tmp","bitcoinwalk-media"),"og");
const pending=new Map<string,Promise<string>>();
/** Fixed, packaged city artwork for legacy profiles without managed media. */
export async function bundledCityBackground(slug:string):Promise<Buffer|null>{
  const city=({warszawa:"warszawa",warsaw:"warszawa",memphis:"memphis",funchal:"funchal"} as Record<string,string>)[slug];
  if(!city)return null;
  try{return await readFile(join(process.cwd(),"public","images","weather-heroes",city,"clear.webp"));}catch{return null;}
}
/** Only existing managed files; never fetch a URL supplied by an event. */
export async function managedBackground(urls:Array<string|undefined|null>):Promise<Buffer|null>{
  for(const value of urls){if(!value)continue;let url:URL;try{url=new URL(value);}catch{continue;}
    if(url.protocol!=="https:"||!['app-staging.bitcoinwalk.org','bitcoinwalk.org'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash)continue;
    const hash=/^\/api\/media\/files\/([a-f0-9]{64})\.webp$/.exec(url.pathname)?.[1];
    if(hash){const body=await readMedia(hash);if(body&&digest(body)===hash)return body;}
  }return null;
}
export async function renderShareImage(background:Buffer|null,icon:Buffer,sponsor:Buffer|null=null,label?:Buffer):Promise<Buffer>{
  const base=background?sharp(background,{limitInputPixels:20_000_000}).rotate().resize(WIDTH,HEIGHT,{fit:"cover",position:"attention"}):sharp({create:{width:WIDTH,height:HEIGHT,channels:3,background:"#25333a"}});
  const mark=await sharp(icon).resize(280,280,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const shade=Buffer.from('<svg width="1200" height="630"><defs><radialGradient id="s"><stop stop-color="#000" stop-opacity=".48"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient></defs><rect width="1200" height="630" fill="url(#s)"/></svg>');
  const layers:Array<{input:Buffer;left?:number;top?:number}>=[{input:shade},{input:mark,left:460,top:sponsor?95:175}];
  if(sponsor){
    // Both overlays retain their alpha: no panel, plate or runtime font rendering.
    const caption=await sharp(label??await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png"))).resize(180,30,{fit:"inside"}).png().toBuffer({resolveWithObject:true});
    const logo=await sharp(sponsor,{limitInputPixels:16_000_000}).resize(320,80,{fit:"contain",background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer();
    layers.push({input:caption.data,left:Math.floor((WIDTH-caption.info.width)/2),top:411},{input:logo,left:440,top:454});
  }
  return base.composite(layers).toColourspace("srgb").jpeg({quality:82,mozjpeg:true}).toBuffer();
}
export async function ensureShareImage(background:Buffer|null,sponsor:Buffer|null=null):Promise<string>{
  const icon=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-share-icon.png"));
  const label=sponsor?await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png")):undefined;
  const key=createHash("sha256").update(JSON.stringify([VERSION,digest(icon),background?digest(background):null,sponsor?digest(sponsor):null,label?digest(label):null])).digest("hex");
  const existing=pending.get(key);if(existing)return existing;
  if(pending.size>=2)throw new Error("Share image renderer busy");
  const work=(async()=>{await mkdir(root(),{recursive:true,mode:0o700});const manifest=join(root(),key+".json");
    try{const stored=JSON.parse(await readFile(manifest,"utf8"));if(typeof stored.hash==="string"&&await readShareImage(stored.hash))return stored.hash;}catch{}
    const body=await renderShareImage(background,icon,sponsor,label),hash=digest(body),file=join(root(),hash+".jpg"),temp=file+"."+randomUUID()+".tmp";
    try{await writeFile(temp,body,{mode:0o600});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
    const mt=manifest+"."+randomUUID()+".tmp";try{await writeFile(mt,JSON.stringify({hash,version:VERSION}),{mode:0o600});await rename(mt,manifest);}finally{await unlink(mt).catch(()=>{});}
    return hash;
  })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
export async function readShareImage(hash:string):Promise<Buffer|null>{if(!/^[a-f0-9]{64}$/.test(hash))return null;try{const body=await readFile(join(root(),hash+".jpg"));return digest(body)===hash?body:null;}catch{return null;}}
