import {createHash,randomBytes,randomUUID} from "node:crypto";
import {finalizeEvent,getPublicKey,nip44,nip47,verifyEvent,type Event} from "nostr-tools";
import {Relay} from "nostr-tools/relay";
import {createPayoutLookup} from "./wallet-lookup";

const reference=/^[a-z0-9][a-z0-9-]{0,62}$/;
function connection(value:string){
 try{
  if(value.length>8192||!value.startsWith("nostr+walletconnect://"))throw new Error();
  const uri=new URL(value);
  if(uri.searchParams.getAll("secret").length!==1)throw new Error();
  const c=nip47.parseConnectionString(value);
  if(!/^[0-9a-f]{64}$/.test(c.pubkey)||!/^[0-9a-f]{64}$/.test(c.secret)||!c.relays.length||c.relays.length>3)throw new Error();
  for(const value of c.relays){const r=new URL(value);if(r.protocol!=="wss:"||r.username||r.password||r.hash)throw new Error();}
  const secret=Buffer.from(c.secret,"hex"),client=getPublicKey(secret);
  return {pubkey:c.pubkey,relays:c.relays,secret,client};
 }catch{throw new Error("Invalid private wallet configuration");}
}
function valid(event:Event){
 // Reconstruct wire fields so an in-memory verification cache cannot bless a
 // mutated event. Bounds also apply before signature verification/decryption.
 if(event.content.length>60000||event.tags.length>32||event.tags.some(t=>t.length>4||t.some(v=>v.length>256)))return false;
 return verifyEvent({id:event.id,sig:event.sig,pubkey:event.pubkey,kind:event.kind,created_at:event.created_at,tags:event.tags,content:event.content});
}
export function supportsPaymentReceivedNotification(event:Event,walletPubkey:string){
 if(event.kind!==13194||event.pubkey!==walletPubkey||!valid(event))return false;
 const tags=event.tags.filter(tag=>tag[0]==="notifications");
 return tags.length===1&&tags[0].length===2&&tags[0][1].split(/\s+/).includes("payment_received");
}

/** Internal authenticated transport. Only narrow reader/wallet wrappers are
 * application interfaces; never expose this RPC to browser input. */
export class PrivateNwcTransport {
 #connection:ReturnType<typeof connection>;
 readonly binding:string;
 constructor(readonly walletRef:string,value:string,checkoutValue:string){
  const own=connection(value),checkout=connection(checkoutValue);
  if(!reference.test(walletRef)||own.client===checkout.client)throw new Error("Separate wallet connection required");
  this.#connection=own;
  // Internal fingerprint binds both identities, not a display label or relay URL.
  this.binding=createHash("sha256").update(`${own.pubkey}:${own.client}`).digest("hex");
 }
 getInfo(){return this.call("get_info",{});}
 lookupInvoice(hash:string){
  if(!/^[0-9a-f]{64}$/.test(hash))throw new Error("Invalid payment hash");
  return this.call("lookup_invoice",{payment_hash:hash});
 }
 listTransactions(offset=0,limit=50){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error("Invalid history page");
  return this.call("list_transactions",{offset,limit});
 }
 lookupPayout(hash:string){return createPayoutLookup(this.walletRef,h=>this.lookupInvoice(h))(hash);}
 listRecoveryTransactions(offset=0,limit=50){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error("Invalid recovery page");
  // Hub defaults omit unpaid transactions. Recovery must include uncertain sends.
  return this.call("list_transactions",{offset,limit,type:"outgoing",unpaid:true});
 }
 async call(method:"get_info"|"make_invoice"|"lookup_invoice"|"list_transactions"|"pay_invoice",params:Record<string,unknown>,beforePublish?:()=>void):Promise<Record<string,unknown>>{
  if(!["get_info","make_invoice","lookup_invoice","list_transactions","pay_invoice"].includes(method))throw new Error("Unsupported wallet method");
  const c=this.#connection;let relay:Relay|undefined;
  try{
   for(const address of c.relays){
    const candidate=new Relay(address,{enableReconnect:false});
    candidate.onauth=async template=>finalizeEvent(template,c.secret);
    try{await candidate.connect({timeout:5000});relay=candidate;break;}catch{candidate.close();}
   }
   if(!relay)throw new Error();
   if(method==="pay_invoice"&&!beforePublish)throw new Error();
   beforePublish?.();
   const active=relay,now=Math.floor(Date.now()/1000);
   const key=nip44.getConversationKey(c.secret,c.pubkey);
   const event=finalizeEvent({kind:23194,created_at:now,tags:[["p",c.pubkey],["encryption","nip44_v2"],["expiration",String(now+30)],["nonce",randomUUID()]],
    content:nip44.encrypt(JSON.stringify({method,params}),key)},c.secret);
   // NIP-44 only in this new adapter. Unsupported wallets fail closed; there is
   // no automatic encryption downgrade or replay onto another relay.
   return await new Promise((resolve,reject)=>{
    let done=false;const subscription:{current?:{close:()=>void}}={};
    const finish=(result?:Record<string,unknown>)=>{if(done)return;done=true;clearTimeout(timer);subscription.current?.close();if(result)resolve(result);else reject(new Error());};
    const timer=setTimeout(()=>finish(),15000);
    try{subscription.current=active.subscribe([{kinds:[23195],authors:[c.pubkey],"#e":[event.id]}],{onevent:response=>{
     try{
      const tags=(name:string)=>response.tags.filter(t=>t[0]===name);
      if(response.kind!==23195||response.pubkey!==c.pubkey||!valid(response)||response.created_at<now-30||response.created_at>Math.floor(Date.now()/1000)+30||
       tags("e").length!==1||tags("e")[0][1]!==event.id||tags("p").length!==1||tags("p")[0][1]!==c.client||
       tags("encryption").length>1||tags("encryption").length===1&&tags("encryption")[0][1]!=="nip44_v2")return;
      const body=JSON.parse(nip44.decrypt(response.content,key));
      if(body.result_type!==method||body.error||!body.result||typeof body.result!=="object"||Array.isArray(body.result)){finish();return;}
      finish(body.result);
     }catch{finish();}
    }});
    if(done)subscription.current.close();else active.publish(event).catch(()=>finish());
    }catch{finish();}
   });
  }catch{throw new Error("Wallet read could not be verified");}finally{relay?.close();}
 }
}

/** Read-only bootstrap probe for one credential before the checkout connection
 * reference is available on this host. It cannot look up or pay invoices. The
 * eventual readiness collector must compare its binding with the separately
 * retained checkout binding before activation. */
export class PrivateNwcReadProbe {
 #transport:PrivateNwcTransport;
 readonly binding:string;
 constructor(walletRef:string,value:string){
  const own=connection(value),ephemeral=randomBytes(32);
  const checkout=new URL(`nostr+walletconnect://${own.pubkey}`);
  for(const relay of own.relays)checkout.searchParams.append("relay",relay);
  checkout.searchParams.set("secret",ephemeral.toString("hex"));
  this.#transport=new PrivateNwcTransport(walletRef,value,checkout.toString());
  this.binding=this.#transport.binding;
 }
 getInfo(){return this.#transport.getInfo();}
 listTransactions(offset=0,limit=1){return this.#transport.listTransactions(offset,limit);}
}

/** One-shot, non-payment acceptance probe. This is not used by the service or
 * exposed over HTTP. It creates one short-lived 1-sat invoice, proves an exact
 * lookup, and checks the wallet's notification advertisement plus relay EOSE.
 * A genuine payment_received delivery still requires separate funded consent. */
export class PrivateNwcUnpaidAcceptance {
 #connection:ReturnType<typeof connection>;
 #transport:PrivateNwcTransport;
 constructor(value:string){
  const own=connection(value),ephemeral=randomBytes(32),checkout=new URL(`nostr+walletconnect://${own.pubkey}`);
  for(const relay of own.relays)checkout.searchParams.append("relay",relay);
  checkout.searchParams.set("secret",ephemeral.toString("hex"));
  this.#connection=own;this.#transport=new PrivateNwcTransport("bitcoinwalk-rustress",value,checkout.toString());
 }
 async run(description:string){
  if(!/^BitcoinWalk Rustress unpaid acceptance [0-9a-f-]{36}$/.test(description))throw new Error("Invalid acceptance description");
  const channel=await this.#notificationChannel();
  const created=await this.#transport.call("make_invoice",{amount:1000,description,expiry:300});
  const hash=created.payment_hash;
  if(typeof hash!=="string"||!/^[0-9a-f]{64}$/.test(hash))throw new Error("Wallet acceptance could not be verified");
  const lookedUp=await this.#transport.lookupInvoice(hash);
  return {created,lookedUp,notificationCapability:channel.capability,notificationSubscriptionEstablished:channel.subscribed};
 }
 async #notificationChannel(){
  const c=this.#connection;let relay:Relay|undefined;
  try{
   for(const address of c.relays){const candidate=new Relay(address,{enableReconnect:false});candidate.onauth=async template=>finalizeEvent(template,c.secret);
    try{await candidate.connect({timeout:5000});relay=candidate;break;}catch{candidate.close();}}
   if(!relay)throw new Error();
   const active=relay,now=Math.floor(Date.now()/1000);
   const subscribed=await new Promise<boolean>((resolve,reject)=>{
    let done=false;const finish=(value:boolean)=>{if(done)return;done=true;clearTimeout(timer);sub.close();resolve(value);};
    const timer=setTimeout(()=>{sub.close();reject(new Error());},10000);
    const sub=active.subscribe([{kinds:[23196,23197],authors:[c.pubkey],"#p":[c.client],since:now}],{oneose:()=>finish(true),onevent:()=>{}});
   });
   const capability=await new Promise<boolean>((resolve,reject)=>{
    let done=false,seen=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);sub.close();resolve(seen);};
    const timer=setTimeout(()=>{sub.close();reject(new Error());},10000);
    const sub=active.subscribe([{kinds:[13194],authors:[c.pubkey],limit:1}],{onevent:event=>{if(supportsPaymentReceivedNotification(event,c.pubkey))seen=true;},oneose:finish});
   });
   return {subscribed,capability};
  }catch{throw new Error("Wallet notification channel could not be verified");}finally{relay?.close();}
 }
}
