import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,rename,writeFile,unlink} from "node:fs/promises";
import {join} from "node:path";
import sharp from "sharp";
import {readMedia} from "./media-store";
import type {ShareBackgroundPosition} from "../domain/hero-presentation";
const VERSION="og-city-v10",WIDTH=1200,HEIGHT=630;
const digest=(body:Buffer)=>createHash("sha256").update(body).digest("hex");
const root=()=>join(process.env.BITCOINWALK_MEDIA_ROOT||join(process.env.TMPDIR||"/tmp","bitcoinwalk-media"),"og");
const pending=new Map<string,Promise<string>>();
async function lightArtwork(body:Buffer):Promise<boolean>{
  const {data}=await sharp(body,{limitInputPixels:16_000_000}).ensureAlpha().resize(64,64,{fit:"inside"}).raw().toBuffer({resolveWithObject:true});
  let luminance=0,weight=0;
  for(let index=0;index<data.length;index+=4){const alpha=data[index+3]/255;if(alpha<.05)continue;luminance+=(data[index]*.2126+data[index+1]*.7152+data[index+2]*.0722)*alpha;weight+=alpha;}
  return weight>0&&luminance/weight>155;
}
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
export async function renderShareImage(background:Buffer|null,icon:Buffer,sponsor:Buffer|null=null,label?:Buffer,cityLogo?:Buffer,position:ShareBackgroundPosition="attention"):Promise<Buffer>{
  const base=background?sharp(background,{limitInputPixels:20_000_000}).rotate().resize(WIDTH,HEIGHT,{fit:"cover",position}):sharp({create:{width:WIDTH,height:HEIGHT,channels:3,background:"#25333a"}});
  // Sponsored previews deliberately use the city-neutral BitcoinWalk symbol.
  // The localized lockup is reserved for unsponsored previews so the sponsored
  // stack contains only: BitcoinWalk symbol, Powered by, sponsor logo.
  const localizedLogo=sponsor?undefined:cityLogo,markWidth=localizedLogo?720:sponsor?42:280,markHeight=localizedLogo?560:sponsor?42:280;
  const mark=await sharp(localizedLogo??icon,{limitInputPixels:16_000_000}).resize(markWidth,markHeight,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  const shade=Buffer.from('<svg width="1200" height="630"><defs><radialGradient id="s"><stop stop-color="#000" stop-opacity=".48"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient></defs><rect width="1200" height="630" fill="url(#s)"/></svg>');
  const layers:Array<{input:Buffer;left?:number;top?:number}>=[{input:shade}];
  if(sponsor){
    // A compact, neutral partner lockup keeps the city photo dominant. The
    // sponsor is always larger than the BitcoinWalk mark and both retain alpha.
    const darkPanel=await lightArtwork(sponsor),panelFill=darkPanel?"#172128":"#ffffff",panelStroke=darkPanel?"#ffffff":"#25333a";
    const panel=Buffer.from(`<svg width="680" height="124"><rect x="1" y="1" width="678" height="122" rx="20" fill="${panelFill}" fill-opacity=".9" stroke="${panelStroke}" stroke-opacity=".18"/></svg>`);
    const brandDisc=Buffer.from('<svg width="60" height="60"><circle cx="30" cy="30" r="30" fill="#f7931a"/></svg>');
    const captionSource=sharp(label??await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png"))).resize(112,20,{fit:"inside"});
    const caption=await (darkPanel?captionSource:captionSource.tint("#25333a")).png().toBuffer({resolveWithObject:true});
    const logo=await sharp(sponsor,{limitInputPixels:16_000_000}).resize(430,68,{fit:"contain",background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer({resolveWithObject:true});
    const panelLeft=WIDTH-680-48,panelTop=HEIGHT-124-40,sponsorLeft=panelLeft+190;
    layers.push(
      {input:panel,left:panelLeft,top:panelTop},
      {input:brandDisc,left:panelLeft+70,top:panelTop+32},
      {input:mark.data,left:panelLeft+79,top:panelTop+41},
      {input:caption.data,left:sponsorLeft,top:panelTop+18},
      {input:logo.data,left:sponsorLeft,top:panelTop+44+Math.floor((64-logo.info.height)/2)},
    );
  }else layers.push({input:mark.data,left:Math.floor((WIDTH-mark.info.width)/2),top:Math.floor((HEIGHT-mark.info.height)/2)});
  return base.composite(layers).toColourspace("srgb").jpeg({quality:82,mozjpeg:true}).toBuffer();
}
export async function ensureShareImage(background:Buffer|null,sponsor:Buffer|null=null,cityLogo?:Buffer,position:ShareBackgroundPosition="attention"):Promise<string>{
  const icon=await readFile(join(process.cwd(),"public","brand","bitcoinwalk-share-icon.png"));
  const label=sponsor?await readFile(join(process.cwd(),"public","brand","bitcoinwalk-powered-by.png")):undefined;
  const localizedLogo=sponsor?undefined:cityLogo;
  const key=createHash("sha256").update(JSON.stringify([VERSION,digest(icon),background?digest(background):null,sponsor?digest(sponsor):null,label?digest(label):null,localizedLogo?digest(localizedLogo):null,position])).digest("hex");
  const existing=pending.get(key);if(existing)return existing;
  if(pending.size>=2)throw new Error("Share image renderer busy");
  const work=(async()=>{await mkdir(root(),{recursive:true,mode:0o700});const manifest=join(root(),key+".json");
    try{const stored=JSON.parse(await readFile(manifest,"utf8"));if(typeof stored.hash==="string"&&await readShareImage(stored.hash))return stored.hash;}catch{}
    const body=await renderShareImage(background,icon,sponsor,label,localizedLogo,position),hash=digest(body),file=join(root(),hash+".jpg"),temp=file+"."+randomUUID()+".tmp";
    try{await writeFile(temp,body,{mode:0o600});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
    const mt=manifest+"."+randomUUID()+".tmp";try{await writeFile(mt,JSON.stringify({hash,version:VERSION}),{mode:0o600});await rename(mt,manifest);}finally{await unlink(mt).catch(()=>{});}
    return hash;
  })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
export async function readShareImage(hash:string):Promise<Buffer|null>{if(!/^[a-f0-9]{64}$/.test(hash))return null;try{const body=await readFile(join(root(),hash+".jpg"));return digest(body)===hash?body:null;}catch{return null;}}
