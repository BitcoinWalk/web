import type {Event} from "nostr-tools";
import type {Nip17Message} from "./nip17-inbox";

/** Cache belongs to one mounted account/Guide pair, never persistent storage. */
export async function openGuideHistory(options:{
 actor:string;guide:string;cache:Map<string,Nip17Message>;
 read:(onBatch:(events:Event[])=>void)=>Promise<Event[]>;
 open:(event:Event)=>Promise<Nip17Message>;
 active:()=>boolean;onMessages:(messages:Nip17Message[])=>void;
}){
 const {actor,guide,cache,read,open,active,onMessages}=options;
 const opened=new Map<string,Nip17Message>(),seen=new Set<string>();
 let unreadable=0,work=Promise.resolve();
 const enqueue=(events:Event[])=>{work=work.then(async()=>{
  for(const event of events){
   if(!active())return;
   if(seen.has(event.id))continue;seen.add(event.id);
   try{
    const message=cache.get(event.id)??await open(event);
    if(!active())return;
    // Do not retain other private conversations in the Guide cache.
    if(message.pubkey!==guide&&!(message.pubkey===actor&&message.recipient===guide))continue;
    cache.set(event.id,message);
    if(cache.size>300)cache.delete(cache.keys().next().value!);
    if(opened.has(message.id))continue;
    opened.set(message.id,message);
    onMessages([...opened.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)));
   }catch{unreadable++;}
  }
 });};
 // Also enqueue the final union, so callers without streaming still work.
 try{enqueue(await read(enqueue));}finally{await work;}
 return {unreadable,count:opened.size};
}
