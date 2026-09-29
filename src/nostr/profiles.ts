import { nip05, SimplePool, verifyEvent, type Event } from "nostr-tools";

export type PublicProfile = { name?: string; picture?: string; nip05?: string; lnurl?: string };
export const profileRelays = [...new Set((process.env.NEXT_PUBLIC_PROFILE_RELAYS ?? "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net,wss://relay.ditto.pub,wss://bucket.coracle.social").split(",").map(s=>s.trim()).filter(s=>{
  try {const u=new URL(s);return u.protocol==="wss:"&&!u.username&&!u.password;} catch{return false;}
}))];

export function safeProfilePicture(value: unknown): string|undefined {
  if(typeof value!=="string" || value.length>2048) return;
  try {
    const u=new URL(value);
    if(u.protocol!=="https:" || u.username || u.password || (u.port && u.port!=="443") || !u.hostname.includes(".") || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":") || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)) return;
    return u.href;
  } catch {return;}
}

function safeProfileText(value:unknown,max:number):string|undefined {
  if(typeof value!=="string") return;
  const clean=value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,"").trim().slice(0,max);
  return clean||undefined;
}

export function safeNip05(value:unknown):string|undefined {
  const clean=safeProfileText(value,254);
  return clean&&nip05.isNip05(clean)?clean:undefined;
}

export function safeLnurl(lud16:unknown,lud06:unknown):string|undefined {
  const address=safeProfileText(lud16,500);
  if(address&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return address;
  const encoded=safeProfileText(lud06,500);
  return encoded&&/^lnurl1[02-9ac-hj-np-z]+$/i.test(encoded)?encoded:undefined;
}

export function parsePublicProfile(event: Event, requested: Set<string>): PublicProfile|null {
  if(event.kind!==0 || !requested.has(event.pubkey) || event.content.length>16000 || event.created_at>Math.floor(Date.now()/1000)+60 || !verifyEvent(event)) return null;
  try {
    const data=JSON.parse(event.content);
    if(!data || typeof data!=="object" || Array.isArray(data)) return null;
    const name=safeProfileText(data.display_name,100)??safeProfileText(data.name,100);
    const picture=safeProfilePicture(data.picture),identifier=safeNip05(data.nip05),lnurl=safeLnurl(data.lud16,data.lud06);
    return {...(name?{name}:{}),...(picture?{picture}:{}),...(identifier?{nip05:identifier}:{}),...(lnurl?{lnurl}:{})};
  } catch {return null;}
}

const nip05Cache=new Map<string,{verified:boolean;time:number}>();
export async function verifyNip05(pubkey:string,identifier:string):Promise<boolean> {
  if(!/^[0-9a-f]{64}$/.test(pubkey)||safeNip05(identifier)!==identifier) return false;
  const key=`${pubkey}:${identifier.toLowerCase()}`,hit=nip05Cache.get(key);
  if(hit&&Date.now()-hit.time<10*60_000)return hit.verified;
  const verified=await nip05.isValid(pubkey,identifier as `${string}@${string}`).catch(()=>false);
  if(nip05Cache.size>=256)nip05Cache.delete(nip05Cache.keys().next().value!);
  nip05Cache.set(key,{verified,time:Date.now()});
  return verified;
}

const cache=new Map<string,{profile:PublicProfile; time:number}>();
/** Read only: never signs, authenticates or publishes to profile relays. */
export function watchPublicProfiles(keys:string[], update:(key:string,profile:PublicProfile)=>void):()=>void {
  let active=true;
  const requested=new Set(keys.filter(k=>/^[0-9a-f]{64}$/.test(k)).slice(0,100));
  const missing:string[]=[];
  for(const key of requested) {
    const hit=cache.get(key);
    if(hit && Date.now()-hit.time<5*60_000) queueMicrotask(()=>{if(active)update(key,hit.profile);});
    else missing.push(key);
  }
  if(!missing.length || !profileRelays.length) return ()=>{active=false;};
  const pool=new SimplePool();
  const latest=new Map<string,Event>();
  let closed=false;
  const close=()=>{if(closed)return;closed=true;active=false;pool.close(profileRelays);pool.destroy();};
  const timer=setTimeout(close,6500);
  pool.subscribeEose(profileRelays,{kinds:[0],authors:missing,limit:100},{
    maxWait:5000,
    onevent:event=>{
      if(!active) return;
      const profile=parsePublicProfile(event,requested);
      if(!profile) return;
      const old=latest.get(event.pubkey);
      if(old && (old.created_at>event.created_at || old.created_at===event.created_at && old.id<=event.id)) return;
      latest.set(event.pubkey,event);
      if(cache.size>=256) cache.delete(cache.keys().next().value!);
      cache.set(event.pubkey,{profile,time:Date.now()});
      update(event.pubkey,profile);
    },
    onclose:()=>{clearTimeout(timer);close();},
  });
  return ()=>{active=false;clearTimeout(timer);close();};
}
